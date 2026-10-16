import urllib.request
import urllib.error
import json

BASE_URL = "http://localhost:8000/api"

def login(username, password):
    data = f"username={username}&password={password}".encode()
    req = urllib.request.Request(f"{BASE_URL}/auth/login", data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read())["access_token"]

def make_req(method, endpoint, token, jsondata=None):
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    data = json.dumps(jsondata).encode() if jsondata else None
    req = urllib.request.Request(f"{BASE_URL}{endpoint}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read()) if response.length else {}
    except urllib.error.HTTPError as e:
        print(f"Error {e.code} on {method} {endpoint}: {e.read().decode()}")
        raise

try:
    print("1. Login EMP001")
    emp_token = login("EMP001", "password123")
    
    print("2. Create UAM Request")
    req = make_req("POST", "/uam/requests", emp_token, {
        "template": "MANUFACTURING",
        "asset_type": "EQUIPMENT",
        "asset_code": "EQ-001",
        "requested_role": "Analyst",
        "action": "CREATE",
        "reason": "Need access for testing",
        "reviewer_id": "HOD001",
        "qa_approver_id": "QA001",
        "it_executor_id": "IT001",
        "plant": "P1"
    })
    req_code = req["request_code"]
    print(f"Created request: {req_code}")
    
    print("3. Login HOD001")
    hod_token = login("HOD001", "password123")
    
    print("4. Approve HOD")
    make_req("POST", f"/uam/requests/{req_code}/approve", hod_token, {"comment": "Approved by HOD"})
    
    print("5. Login QA001")
    qa_token = login("QA001", "password123")
    
    print("6. Approve QA")
    make_req("POST", f"/uam/requests/{req_code}/approve", qa_token, {"comment": "Approved by QA"})
    
    print("7. Login IT001")
    it_token = login("IT001", "password123")
    
    print("8. Execute IT")
    make_req("POST", f"/uam/requests/{req_code}/execute", it_token, {"user_login_id": "emp_sys_001", "password": "temppassword"})
    
    print("9. Acknowledge EMP001")
    make_req("POST", f"/uam/requests/{req_code}/acknowledge", emp_token, {"comment": "Thanks"})
    
    print("SUCCESS: End-to-end workflow completed.")
except Exception as e:
    print(f"FAILED: {e}")
