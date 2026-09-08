import urllib.request
import json

payload = json.dumps({
    'name': 'Test Equipment 2',
    'type': 'Software',
    'location': 'Lab D',
    'plant': 'P3',
    'allowed_roles': ['Analyst'],
    'validation_date': '2027-01-01'
}).encode('utf-8')

req = urllib.request.Request(
    'http://localhost:8000/api/equipment',
    data=payload,
    headers={
        'X-Demo-User': 'ADM001',
        'Content-Type': 'application/json'
    },
    method='POST'
)

res = urllib.request.urlopen(req)
print('status:', res.status)
print('body:', res.read().decode('utf-8'))
