"""End-to-end smoke test over the whole API. Run: python -m pytest tests -q"""
import os
import tempfile

os.environ["CRM_DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "t.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def login(c, email, pw):
    r = c.post("/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_full_flow():
    with TestClient(app) as c:
        A = login(c, "admin@crm.local", "Admin@123")
        meta = c.get("/api/meta", headers=A).json()
        assert len(meta["statuses"]) == 7
        mgr_role = next(r for r in c.get("/api/roles", headers=A).json()["roles"] if r["name"] == "Manager")

        ids = []
        for n in ["Amit", "Priya"]:
            r = c.post("/api/users", headers=A, json={"name": n, "email": f"{n}@x.com", "password": "Secret123",
                                                      "role_id": mgr_role["id"]})
            assert r.status_code == 201, r.text
            ids.append(r.json()["id"])
        amit, priya = ids

        # round-robin via website API (POST /api/leads with X-API-Key)
        key = c.get("/api/settings", headers=A).json()["integration"]["api_key"]
        got = []
        for i in range(4):
            r = c.post("/api/leads", headers={"X-API-Key": key},
                       json={"name": f"Web {i}", "phone": f"98765432{i}0", "source": "website", "budget": "₹1L+"})
            assert r.status_code == 201, r.text
            got.append(r.json()["assigned_to"])
        assert got == ["Amit", "Priya", "Amit", "Priya"], got
        assert c.post("/api/public/leads", json={"name": "x", "phone": "1"}).status_code == 401

        # duplicate enquiry bumps count
        r = c.post("/api/public/leads", headers={"X-API-Key": key},
                   json={"name": "Web 0 again", "phone": "+91 9876543200", "message": "again"})
        assert r.json()["duplicate"] is True

        # form-encoded post with aliases
        r = c.post(f"/api/public/leads?api_key={key}",
                   data={"full_name": "Form Guy", "mobile": "9000000001", "utm_source": "google_ads"})
        assert r.status_code == 201, r.text

        # single-manager mode
        r = c.patch("/api/settings/assignment", headers=A, json={"mode": "specific", "specific_user_id": priya})
        assert r.status_code == 200, r.text
        r = c.post("/api/public/leads", headers={"X-API-Key": key}, json={"name": "Spec", "email": "s@s.com"})
        assert r.json()["assigned_to"] == "Priya"

        # auto-assign off
        c.patch("/api/settings/assignment", headers=A, json={"auto_assign": False})
        r = c.post("/api/public/leads", headers={"X-API-Key": key}, json={"name": "Nobody", "email": "n@n.com"})
        assert r.json()["assigned_to"] is None
        c.patch("/api/settings/assignment", headers=A, json={"auto_assign": True, "mode": "round_robin"})

        # manager scoping
        M = login(c, "amit@x.com", "Secret123")
        mine = c.get("/api/leads", headers=M).json()
        # Web 0, Web 2 and Form Guy rotated to Amit
        assert mine["total"] == 3 and all(l["assigned_to"]["name"] == "Amit" for l in mine["items"])
        assert c.get("/api/users", headers=M).status_code == 403
        assert c.get("/api/settings", headers=M).status_code == 403
        lead_id = mine["items"][0]["id"]

        # manager creates lead -> self-assigned
        r = c.post("/api/leads", headers=M, json={"name": "Manual", "phone": "9111111111",
                                                  "custom": {"customer_type": "startup"}})
        assert r.status_code == 201, r.text
        assert r.json()["assigned_to"]["name"] == "Amit" and r.json()["custom"]["customer_type"] == "Startup"

        # status move, note, follow-up, contact
        st = next(s for s in meta["statuses"] if s["name"] == "Interested")
        won = next(s for s in meta["statuses"] if s["category"] == "won")
        assert c.post(f"/api/leads/{lead_id}/move", headers=M, json={"status_id": st["id"]}).status_code == 200
        assert c.post(f"/api/leads/{lead_id}/notes", headers=M, json={"content": "Wants quotation"}).status_code == 201
        r = c.post(f"/api/leads/{lead_id}/followups", headers=M,
                   json={"due_at": "2020-01-01T10:00:00Z", "note": "Call regarding quotation"})
        assert r.status_code == 201, r.text
        fid = r.json()["id"]
        assert c.post(f"/api/leads/{lead_id}/contact", headers=M, json={"channel": "call"}).status_code == 200
        assert c.get("/api/followups/summary", headers=M).json()["overdue"] == 1
        n = c.get("/api/notifications", headers=M).json()
        assert any(x["type"] == "followup_overdue" for x in n["items"]), n
        c.patch(f"/api/followups/{fid}", headers=M, json={"status": "done", "outcome": "Sent quote"})
        c.patch(f"/api/leads/{lead_id}", headers=M, json={"status_id": won["id"], "phone": "9222222222"})
        detail = c.get(f"/api/leads/{lead_id}", headers=M).json()
        actions = [a["action"] for a in detail["activities"]]
        for a in ["lead_created", "lead_assigned", "status_changed", "note_added", "followup_created",
                  "followup_completed", "contacted", "lead_edited"]:
            assert a in actions, (a, actions)
        assert detail["lead"]["converted_at"]

        # manager cannot reassign or delete by default; other managers can't see it
        assert c.post(f"/api/leads/{lead_id}/assign", headers=M, json={"assigned_to_id": priya}).status_code == 403
        assert c.delete(f"/api/leads/{lead_id}", headers=M).status_code == 403
        P = login(c, "priya@x.com", "Secret123")
        assert c.get(f"/api/leads/{lead_id}", headers=P).status_code == 404

        # admin: bulk assign, search, filters, pipeline, export, dashboard, reports, activity
        all_ids = [l["id"] for l in c.get("/api/leads?page_size=100", headers=A).json()["items"]]
        r = c.post("/api/leads/bulk", headers=A,
                   json={"lead_ids": all_ids[:3], "action": "assign", "assigned_to_id": priya})
        assert r.status_code == 200, r.text
        assert c.get("/api/leads?q=LD-10001", headers=A).json()["total"] == 1
        assert c.get("/api/leads?q=76543200", headers=A).json()["total"] >= 1
        assert c.get("/api/leads", headers=A, params={"cf.budget": "₹1L+"}).json()["total"] >= 1
        assert c.get("/api/leads/pipeline", headers=A).status_code == 200
        assert c.get("/api/leads/export", headers=A).status_code == 200
        d = c.get("/api/dashboard?tz_offset=330", headers=A).json()
        assert d["totals"]["total"] >= 8 and d["managers"]
        rep = c.get("/api/reports", headers=A).json()
        assert rep["top_enquirers"][0]["enquiries"] == 2
        assert c.get("/api/reports", headers=M).status_code == 403
        assert c.get("/api/activity?action=login", headers=A).json()["total"] >= 3
        own = c.get("/api/activity", headers=M).json()
        assert all(a["user"]["id"] == amit for a in own["items"] if a["user"])

        # CSV import
        csv_data = ("Name,Phone,Source,Status,Assigned To,Tags,Budget\n"
                    'CSV One,9333333333,Referral,Contacted,priya@x.com,"Hot,Pune",₹10k–₹25k\n'
                    ",,,,,,\n")
        r = c.post("/api/leads/import", headers=A, files={"file": ("l.csv", csv_data.encode(), "text/csv")})
        assert r.json()["created"] == 1 and len(r.json()["errors"]) == 1, r.text

        # user admin actions
        assert c.post(f"/api/users/{amit}/reset-password", headers=A,
                      json={"password": "NewPass123"}).status_code == 200
        assert c.get("/api/auth/me", headers=M).status_code == 401  # old session revoked
        assert c.patch(f"/api/users/{priya}", headers=A, json={"is_active": False}).status_code == 200
        assert c.post("/api/auth/login", json={"email": "priya@x.com", "password": "Secret123"}).status_code == 403
        assert c.delete(f"/api/users/{priya}?reassign_to_id={amit}", headers=A).status_code == 200

        # custom status; deleting an in-use status requires a target
        r = c.post("/api/statuses", headers=A, json={"name": "Negotiation", "color": "#123456"})
        assert r.status_code == 201
        new_st = next(s for s in meta["statuses"] if s["name"] == "New")
        assert c.delete(f"/api/statuses/{new_st['id']}", headers=A).status_code == 400
        assert c.delete(f"/api/statuses/{new_st['id']}?move_to_id={r.json()['id']}", headers=A).status_code == 200

        r = c.post("/api/custom-fields", headers=A, json={"name": "Visit Date", "field_type": "date"})
        assert r.status_code == 201 and r.json()["key"] == "visit_date"

        # shared pool + claim
        c.patch("/api/settings/assignment", headers=A, json={"mode": "shared"})
        r = c.post("/api/public/leads", headers={"X-API-Key": key}, json={"name": "Pool", "phone": "9444444444"})
        pid = r.json()["lead_id"]
        M = login(c, "amit@x.com", "NewPass123")
        assert c.get(f"/api/leads/{pid}", headers=M).status_code == 200
        assert c.post(f"/api/leads/{pid}/claim", headers=M).json()["assigned_to"]["name"] == "Amit"
        assert c.post("/api/auth/logout", headers=M).status_code == 200
