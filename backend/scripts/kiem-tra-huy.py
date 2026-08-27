#!/usr/bin/env python3
"""
Kiểm tra tự động toàn bộ endpoint phần của Huy (Tổ chức & Workspace).

CÁCH CHẠY:
    cd backend
    npm run start:dev          # cửa sổ terminal thứ nhất, để chạy nền
    python3 scripts/kiem-tra-huy.py   # cửa sổ thứ hai

Không cần cài gì thêm — chỉ dùng thư viện có sẵn của Python 3.

Script tự làm hết: tạo 2 tài khoản test, tạo tổ chức riêng cho lần chạy này,
chạy 52 phép thử, rồi DỌN SẠCH dữ liệu test. Chạy lại bao nhiêu lần cũng được.
"""
import json, os, sys, time, urllib.request, urllib.error

BASE = os.environ.get('BASE_URL', 'http://localhost:3000')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

G, R, Y, DIM, RS = '\033[32m', '\033[31m', '\033[33m', '\033[2m', '\033[0m'

# ---------------------------------------------------------------- tiện ích

def doc_env(ten):
    """Đọc 1 biến trong secrets/.env (dự phòng: backend/.env)"""
    p = os.path.join(ROOT, '..', 'secrets', '.env')
    if not os.path.exists(p):          # máy chưa gộp env thì vẫn chạy được
        p = os.path.join(ROOT, '.env')
    if not os.path.exists(p):
        return None
    for line in open(p, encoding='utf-8'):
        line = line.strip()
        if line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        if k.strip() == ten:
            return v.strip().strip('"').strip("'")
    return None


def doc_api_key():
    """Firebase Web API key — lấy từ file environment Postman bất kỳ."""
    d = os.path.join(ROOT, 'postman')
    for f in sorted(os.listdir(d)):
        if f.endswith('.postman_environment.json'):
            for v in json.load(open(os.path.join(d, f), encoding='utf-8'))['values']:
                if v['key'] == 'firebaseApiKey' and v.get('value'):
                    return v['value']
    return None


def firebase(op, email, pw='Passw0rd!'):
    u = f'https://identitytoolkit.googleapis.com/v1/accounts:{op}?key={API_KEY}'
    body = json.dumps({'email': email, 'password': pw, 'returnSecureToken': True}).encode()
    req = urllib.request.Request(u, data=body, headers={'Content-Type': 'application/json'})
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        return {'loi': json.load(e)['error']['message']}


def goi(method, path, token=None, body=None):
    """Gọi 1 endpoint, trả về (status_code, dữ liệu)."""
    req = urllib.request.Request(BASE + path, method=method)
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    if body is not None:
        req.add_header('Content-Type', 'application/json')
        req.data = json.dumps(body).encode()
    try:
        r = urllib.request.urlopen(req)
        return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b'null')
        except Exception:
            return e.code, None
    except urllib.error.URLError as e:
        print(f'\n{R}Không kết nối được {BASE} — backend chưa chạy?{RS}')
        print(f'{DIM}  Mở terminal khác, chạy:  cd backend && npm run start:dev{RS}\n')
        sys.exit(1)


DAT, HONG = [], []


def thu(ma_so, mo_ta, method, path, token, body, mong_doi, kiem_them=None):
    st, data = goi(method, path, token, body)
    ok = st == mong_doi
    if ok and kiem_them:
        ok, ly_do = kiem_them(data)
    else:
        ly_do = f'nhận {st}, mong {mong_doi}'
    (DAT if ok else HONG).append((ma_so, mo_ta, ly_do, data))
    dau = f'{G}✔{RS}' if ok else f'{R}✘{RS}'
    print(f'  {dau} {ma_so:6} {mo_ta:52} {DIM}{st}{RS}')
    if not ok:
        print(f'      {R}→ {ly_do}{RS}')
        print(f'      {DIM}{json.dumps(data, ensure_ascii=False)[:180]}{RS}')
    return data


def muc(tieu_de):
    print(f'\n{Y}── {tieu_de} {"─" * max(0, 60 - len(tieu_de))}{RS}')


# ---------------------------------------------------------------- chuẩn bị

print(f'\n{Y}KIỂM TRA PHẦN CỦA HUY — Tổ chức & Workspace{RS}')
print(f'{DIM}{BASE}{RS}\n')

API_KEY = doc_api_key()
if not API_KEY:
    print(f'{R}Không tìm thấy firebaseApiKey.{RS}')
    print(f'{DIM}  Cần có ít nhất 1 file backend/postman/*.postman_environment.json{RS}\n')
    sys.exit(1)

st, _ = goi('GET', '/health')
if st != 200:
    print(f'{R}GET /health trả {st} — backend chưa sẵn sàng.{RS}\n')
    sys.exit(1)
print(f'{G}✔{RS} Backend đang chạy')

EMAIL_A, EMAIL_B = 'hocvien-a@test.dev', 'kiemtra-b@test.dev'
for e in (EMAIL_A, EMAIL_B):
    firebase('signUp', e)          # đã có thì báo EMAIL_EXISTS, bỏ qua
ra = firebase('signInWithPassword', EMAIL_A)
rb = firebase('signInWithPassword', EMAIL_B)
if 'idToken' not in ra or 'idToken' not in rb:
    print(f'{R}Không đăng nhập được: {ra.get("loi") or rb.get("loi")}{RS}\n')
    sys.exit(1)

A, A_UID = ra['idToken'], ra['localId']
B, B_UID = rb['idToken'], rb['localId']
goi('GET', '/auth/me', A)          # tạo dòng trong bảng users
goi('GET', '/auth/me', B)
print(f'{G}✔{RS} Tài khoản A (chủ tổ chức): {EMAIL_A}')
print(f'{G}✔{RS} Tài khoản B (người ngoài): {EMAIL_B}')

SLUG = f'kt-{int(time.time())}'    # slug riêng mỗi lần chạy → không bao giờ 409
KHONG_CO = '00000000-0000-4000-8000-000000000999'

# ---------------------------------------------------------------- 1. tạo tổ chức

muc('1. POST /organizations — tạo tổ chức')

def co_du_truong(d):
    thieu = [k for k in ('id', 'name', 'slug', 'ownerId', 'createdAt') if k not in (d or {})]
    return (not thieu, f'thiếu trường: {thieu}' if thieu else 'đủ 5 trường camelCase')

org = thu('1.1', 'tạo tổ chức mới', 'POST', '/organizations', A,
          {'name': 'Tổ chức kiểm tra', 'slug': SLUG}, 201, co_du_truong)
OID = org.get('id') if isinstance(org, dict) else None
if not OID:
    print(f'\n{R}Không tạo được tổ chức — dừng tại đây.{RS}\n')
    sys.exit(1)

thu('1.2', 'slug trùng → 409', 'POST', '/organizations', A, {'name': 'X', 'slug': SLUG}, 409)
thu('1.3', 'slug quá ngắn (2 ký tự) → 400', 'POST', '/organizations', A, {'name': 'X', 'slug': 'ab'}, 400)
thu('1.4', 'slug là từ khoá hệ thống → 400', 'POST', '/organizations', A, {'name': 'X', 'slug': 'settings'}, 400)
thu('1.5', 'slug có chữ HOA → 400', 'POST', '/organizations', A, {'name': 'X', 'slug': 'Sai-Slug'}, 400)
thu('1.6', 'thiếu name → 400', 'POST', '/organizations', A, {'slug': 'thieu-ten-abc'}, 400)
thu('1.7', 'không gắn token → 401', 'POST', '/organizations', None, {'name': 'X', 'slug': 'khong-token'}, 401)

# ---------------------------------------------------------------- 2. tổ chức của tôi

muc('2. GET /organizations — tổ chức của tôi')

def la_owner(d):
    cai_nay = [o for o in (d or []) if o.get('id') == OID]
    if not cai_nay:
        return False, 'KHÔNG thấy tổ chức vừa tạo — thiếu bước insert organization_members?'
    return (cai_nay[0].get('role') == 'owner', f"role = {cai_nay[0].get('role')}, mong owner")

thu('2.1', 'thấy tổ chức vừa tạo, role = owner', 'GET', '/organizations', A, None, 200, la_owner)
thu('2.2', 'B chưa thuộc tổ chức nào → []', 'GET', '/organizations', B, None, 200,
    lambda d: (isinstance(d, list) and not [o for o in d if o.get('id') == OID],
               'B không được thấy tổ chức của A'))

# ---------------------------------------------------------------- 3-6. workspace

muc('3-6. WORKSPACES — CRUD + phân quyền')

ws = thu('3.1', 'tạo workspace', 'POST', '/workspaces', A,
         {'orgId': OID, 'name': 'Workspace kiểm tra', 'description': 'mô tả'}, 201,
         lambda d: (all(k in (d or {}) for k in ('id', 'orgId', 'name', 'createdBy')),
                    'đủ trường camelCase'))
WID = ws.get('id') if isinstance(ws, dict) else None

thu('3.2', 'B tạo workspace trong tổ chức của A → 403', 'POST', '/workspaces', B,
    {'orgId': OID, 'name': 'Trộm'}, 403)
thu('3.3', 'orgId không phải uuid → 400', 'POST', '/workspaces', A,
    {'orgId': 'khong-phai-uuid', 'name': 'X'}, 400)
thu('4.1', 'liệt kê workspace', 'GET', f'/workspaces?orgId={OID}', A, None, 200,
    lambda d: (any(w.get('id') == WID for w in (d or [])), 'có workspace vừa tạo'))
thu('4.2', 'B liệt kê workspace của A → 403', 'GET', f'/workspaces?orgId={OID}', B, None, 403)
thu('5.1', 'đổi tên workspace', 'PATCH', f'/workspaces/{WID}', A, {'name': 'Tên mới'}, 200,
    lambda d: ((d or {}).get('name') == 'Tên mới', f"name = {(d or {}).get('name')}"))
thu('5.2', 'workspace không tồn tại → 404', 'PATCH', f'/workspaces/{KHONG_CO}', A, {'name': 'X'}, 404)
thu('5.3', 'B sửa workspace của A → 404 (không phải 403)', 'PATCH', f'/workspaces/{WID}', B,
    {'name': 'X'}, 404)

# ---------------------------------------------------------------- 7. thành viên

muc('7. GET /organizations/:id/members')

def co_thong_tin_user(d):
    if not d:
        return False, 'mảng rỗng — phải có ít nhất owner'
    m = d[0]
    if 'user' not in m:
        return False, 'thiếu khối "user" lồng bên trong — chưa join sang bảng users'
    return ('email' in m['user'], 'có user.email')

thu('7.1', 'danh sách thành viên kèm tên/email', 'GET', f'/organizations/{OID}/members', A,
    None, 200, co_thong_tin_user)
thu('7.2', 'B xem thành viên tổ chức của A → 403', 'GET', f'/organizations/{OID}/members', B, None, 403)

# ---------------------------------------------------------------- 8-10. lời mời

muc('8-10. LỜI MỜI — mời, xem, trả lời')

inv = thu('8.1', 'A mời B vào tổ chức', 'POST', f'/organizations/{OID}/invites', A,
          {'toUserId': B_UID}, 201,
          lambda d: ((d or {}).get('fromUserId') == A_UID,
                     'fromUserId phải lấy từ TOKEN, không phải từ body'))
IID = inv.get('id') if isinstance(inv, dict) else None

thu('8.2', 'mời lại khi đang chờ → 409', 'POST', f'/organizations/{OID}/invites', A,
    {'toUserId': B_UID}, 409)
thu('8.3', 'mời user không tồn tại → 404', 'POST', f'/organizations/{OID}/invites', A,
    {'toUserId': 'uid-khong-co-that'}, 404)
thu('8.4', 'B (chưa là thành viên) mời người → 403', 'POST', f'/organizations/{OID}/invites', B,
    {'toUserId': B_UID}, 403)

def co_ten_to_chuc(d):
    cai_nay = [i for i in (d or []) if i.get('id') == IID]
    if not cai_nay:
        return False, 'không thấy lời mời'
    i = cai_nay[0]
    if not i.get('orgName'):
        return False, 'thiếu orgName — chuông thông báo sẽ hiện uuid thay vì tên tổ chức'
    return ('fromUser' in i, 'có orgName và fromUser')

thu('9.1', 'B xem lời mời của mình', 'GET', '/organizations/invites/me', B, None, 200, co_ten_to_chuc)
thu('9.2', 'A xem lời mời (A không được mời) → []', 'GET', '/organizations/invites/me', A, None, 200,
    lambda d: (not [i for i in (d or []) if i.get('id') == IID], 'A không thấy lời mời của B'))
thu('10.1', 'A trả lời hộ lời mời của B → 403', 'PATCH', f'/organizations/invites/{IID}', A,
    {'accept': True}, 403)
thu('10.2', 'accept không phải boolean → 400', 'PATCH', f'/organizations/invites/{IID}', B,
    {'accept': 'yes'}, 400)
thu('10.3', 'B đồng ý lời mời', 'PATCH', f'/organizations/invites/{IID}', B, {'accept': True}, 200)
thu('10.4', 'trả lời lần thứ hai → 409', 'PATCH', f'/organizations/invites/{IID}', B,
    {'accept': True}, 409)
thu('10.5', 'lời mời không tồn tại → 404', 'PATCH', f'/organizations/invites/{KHONG_CO}', B,
    {'accept': True}, 404)
thu('10.6', 'B giờ đã thuộc tổ chức, role = member', 'GET', '/organizations', B, None, 200,
    lambda d: (any(o.get('id') == OID and o.get('role') == 'member' for o in (d or [])),
               'CHỈ đổi status mà quên insert organization_members?'))

# ---------------------------------------------------------------- 11. RolesGuard

muc('11. RolesGuard — chặn được người không đủ quyền chưa')

thu('11.1', 'B (member) đổi vai trò → 403', 'PATCH', f'/organizations/{OID}/members/{B_UID}/role',
    B, {'role': 'admin'}, 403,
    lambda d: (bool((d or {}).get('message')), 'thông báo lỗi không được rỗng'))
thu('11.2', 'B (member) xoá thành viên → 403', 'DELETE', f'/organizations/{OID}/members/{B_UID}',
    B, None, 403)
thu('11.3', 'A (owner) phong B lên admin', 'PATCH', f'/organizations/{OID}/members/{B_UID}/role',
    A, {'role': 'admin'}, 200)
thu('11.4', 'role sai giá trị → 400', 'PATCH', f'/organizations/{OID}/members/{B_UID}/role',
    A, {'role': 'sepbig'}, 400)
thu('11.5', 'đổi vai trò người ngoài tổ chức → 404', 'PATCH',
    f'/organizations/{OID}/members/uid-khong-co/role', A, {'role': 'admin'}, 404)

# ---------------------------------------------------------------- 12. chuyển owner

muc('12. Chuyển quyền owner — chỗ dễ vỡ nhất')

def vai_tro():
    _, d = goi('GET', f'/organizations/{OID}/members', A)
    if not isinstance(d, list):
        _, d = goi('GET', f'/organizations/{OID}/members', B)
    return {m['userId']: m['role'] for m in d} if isinstance(d, list) else {}

truoc = vai_tro()
print(f'  {DIM}trước: A={truoc.get(A_UID)}  B={truoc.get(B_UID)}{RS}')
thu('12.1', 'A phong B lên owner', 'PATCH', f'/organizations/{OID}/members/{B_UID}/role',
    A, {'role': 'owner'}, 200)
sau = vai_tro()
print(f'  {DIM}sau:   A={sau.get(A_UID)}  B={sau.get(B_UID)}{RS}')

so_owner = sum(1 for v in sau.values() if v == 'owner')
for ma, mo_ta, dieu_kien, ly_do in [
    ('12.2', 'tổ chức chỉ có ĐÚNG 1 owner', so_owner == 1, f'đếm được {so_owner} owner'),
    ('12.3', 'B đã thành owner', sau.get(B_UID) == 'owner', f"B = {sau.get(B_UID)}"),
    ('12.4', 'A tự động bị hạ xuống admin', sau.get(A_UID) == 'admin', f"A = {sau.get(A_UID)}"),
]:
    (DAT if dieu_kien else HONG).append((ma, mo_ta, ly_do, sau))
    print(f'  {(G + "✔" + RS) if dieu_kien else (R + "✘" + RS)} {ma:6} {mo_ta:52} {DIM}—{RS}')
    if not dieu_kien:
        print(f'      {R}→ {ly_do}{RS}')

thu('12.5', 'A (giờ là admin) đổi vai trò → 403', 'PATCH',
    f'/organizations/{OID}/members/{A_UID}/role', A, {'role': 'owner'}, 403)
thu('12.6', 'B trả quyền owner lại cho A', 'PATCH', f'/organizations/{OID}/members/{A_UID}/role',
    B, {'role': 'owner'}, 200)

# ---------------------------------------------------------------- 13. xoá thành viên

muc('13. DELETE /organizations/:id/members/:userId')

thu('13.1', 'xoá chính owner → 400', 'DELETE', f'/organizations/{OID}/members/{A_UID}', A, None, 400)
thu('13.2', 'xoá người ngoài tổ chức → 404', 'DELETE', f'/organizations/{OID}/members/uid-khong-co',
    A, None, 404)
thu('13.3', 'A xoá B khỏi tổ chức', 'DELETE', f'/organizations/{OID}/members/{B_UID}', A, None, 200)
thu('13.4', 'B bị xoá → không xem được thành viên nữa', 'GET', f'/organizations/{OID}/members',
    B, None, 403)
thu('13.5', 'B bị xoá → GET /organizations không còn tổ chức đó', 'GET', '/organizations', B,
    None, 200, lambda d: (not [o for o in (d or []) if o.get('id') == OID],
                          'quyền phải bị thu hồi NGAY, không đợi token hết hạn'))

# ---------------------------------------------------------------- 14. xoá workspace

muc('14. DELETE /workspaces/:id')

thu('14.1', 'A xoá workspace', 'DELETE', f'/workspaces/{WID}', A, None, 200)
thu('14.2', 'xoá lần thứ hai → 404', 'DELETE', f'/workspaces/{WID}', A, None, 404)

# ---------------------------------------------------------------- 15. bảo mật

muc('15. Bảo mật — dữ liệu tổ chức khác')

_, org_la = goi('POST', '/organizations', B, {'name': 'Tổ chức của B', 'slug': SLUG + '-b'})
XID = org_la.get('id') if isinstance(org_la, dict) else None

if XID:
    thu('15.1', 'A xem thành viên tổ chức của B → 403', 'GET', f'/organizations/{XID}/members',
        A, None, 403)
    thu('15.2', 'A liệt kê workspace của B → 403', 'GET', f'/workspaces?orgId={XID}', A, None, 403)
    thu('15.3', 'A tạo workspace trong tổ chức B → 403', 'POST', '/workspaces', A,
        {'orgId': XID, 'name': 'Trộm'}, 403)
    thu('15.4', 'A mời người vào tổ chức của B → 403', 'POST', f'/organizations/{XID}/invites',
        A, {'toUserId': A_UID}, 403)
thu('15.5', 'token bịa đặt → 401', 'GET', '/organizations', 'token.bia.dat', None, 401)

# ---------------------------------------------------------------- dọn dẹp

muc('Dọn dẹp')
url, key = doc_env('SUPABASE_URL'), doc_env('SUPABASE_SERVICE_ROLE_KEY')
if url and key:
    xoa = 0
    for oid in filter(None, [OID, XID]):
        req = urllib.request.Request(f'{url}/rest/v1/organizations?id=eq.{oid}', method='DELETE',
                                     headers={'apikey': key, 'Authorization': f'Bearer {key}'})
        try:
            urllib.request.urlopen(req); xoa += 1
        except Exception as e:
            print(f'  {Y}!{RS} không xoá được {oid}: {e}')
    print(f'  {G}✔{RS} đã xoá {xoa} tổ chức test, database sạch như trước khi chạy')
else:
    print(f'  {Y}!{RS} không đọc được secrets/.env — để lại tổ chức test slug "{SLUG}"')

# ---------------------------------------------------------------- kết quả

tong = len(DAT) + len(HONG)
print(f'\n{Y}{"═" * 64}{RS}')
if HONG:
    print(f'{R}KẾT QUẢ: {len(DAT)}/{tong} đạt — {len(HONG)} phép thử KHÔNG ĐẠT{RS}\n')
    for ma, mo_ta, ly_do, _ in HONG:
        print(f'  {R}✘{RS} {ma:6} {mo_ta}')
        print(f'      {DIM}{ly_do}{RS}')
    print(f'\n{DIM}Xem chi tiết từng phép thử: backend/docs/KIEM-TRA-HUY.md{RS}\n')
    sys.exit(1)
print(f'{G}KẾT QUẢ: {tong}/{tong} ĐẠT — phần của Huy hoạt động đúng.{RS}\n')
