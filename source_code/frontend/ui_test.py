"""Browser walk-through of the UAM Testing Observations sheet (Chrome via Playwright).

    python ui_test.py http://localhost:5174 out_dir
    python ui_test.py https://<deployed-frontend> out_dir

Creates test records (equipment, requests). Prints PASS/FAIL per sheet row and
saves a screenshot per section into out_dir.
"""
import re
import sys
import time
import traceback
import uuid
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:5174"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "ui_out")
OUT.mkdir(parents=True, exist_ok=True)
PW = "password123"
TAG = uuid.uuid4().hex[:5].upper()
DATE_RE = re.compile(r"\b\d{2}/\d{2}/\d{4}\b")
results: list[tuple[str, str, bool, str]] = []


def check(row, label, cond, detail=""):
    results.append((str(row), label, bool(cond), str(detail)[:200]))
    print(f"{'PASS' if cond else 'FAIL'}  row {row:<7} {label}" + ("" if cond else f"  -> {str(detail)[:200]}"), flush=True)


def shot(page: Page, name: str):
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)


def section(name):
    def wrap(fn):
        def run(*a, **k):
            try:
                fn(*a, **k)
            except Exception as exc:  # noqa: BLE001 - keep walking the other sections
                check("-", f"[{name}] crashed", False, f"{type(exc).__name__}: {exc}")
                traceback.print_exc()
                try:
                    shot(a[0], f"crash-{name}")
                except Exception:  # noqa: BLE001
                    pass
        return run
    return wrap


def login(page: Page, user: str, plant: str = "P1"):
    page.goto(f"{BASE}/login")
    page.evaluate("localStorage.clear()")
    page.goto(f"{BASE}/login")
    page.get_by_placeholder("Enter your username").wait_for(timeout=60000)
    page.get_by_placeholder("Enter your username").fill(user)
    plant_select = page.locator("select").first
    expect(plant_select.locator(f"option[value='{plant}']")).to_have_count(1, timeout=15000)
    plant_select.select_option(plant)
    page.get_by_placeholder("Enter your password").fill(PW)
    page.get_by_role("button", name="Sign In").click()
    page.wait_for_url(re.compile(r".*/dashboard"), timeout=30000)
    page.wait_for_load_state("networkidle")


def esign(page: Page, reason="UI test e-signature"):
    """Fill the open credentials (e-signature) dialog and confirm."""
    dlg = page.locator("div.fixed.inset-0").last
    dlg.get_by_placeholder("Enter your password").fill(PW)
    reason_box = dlg.get_by_placeholder("Reason / comment for this action")
    if reason_box.count():
        reason_box.fill(reason)
    dlg.locator("button").filter(has_text=re.compile(r"Confirm|Sign|Submit|Approve|Save|Verify|Reject|Send|Complete|Resubmit|Execute", re.I)).last.click()


def toast_text(page: Page) -> str:
    page.wait_for_timeout(1200)
    return page.locator("body").inner_text()


@section("login")
def t_login(page: Page):
    page.goto(f"{BASE}/login")
    page.get_by_placeholder("Enter your username").wait_for(timeout=60000)
    body = page.locator("body").inner_text()
    check(2, "login shows Username (not Employee ID)", "Username" in body and "Employee ID" not in body)
    check(3, "login footer 'Powered by Air Care Zone' + copyright", "Powered by" in body and "Air Care Zone" in body and "©" in body)
    bg = page.evaluate("getComputedStyle(document.querySelector('#root > div')).backgroundImage")
    check(1, "login background image", "login-bg.svg" in bg, bg)
    page.get_by_placeholder("Enter your username").fill("EMP001")
    page.wait_for_timeout(1500)
    opts = page.locator("select").first.locator("option").all_inner_texts()
    check(24, "plant dropdown lists the user's plants", "P1" in opts and "P2" in opts, opts)
    shot(page, "01-login")
    # refused for a plant the user does not belong to (HOD002 is P2 only)
    page.get_by_placeholder("Enter your username").fill("HOD002")
    page.wait_for_timeout(1500)
    opts = page.locator("select").first.locator("option").all_inner_texts()
    check(24, "plant list restricted to the user's plants", opts == ["P2"], opts)


@section("shell")
def t_shell(page: Page):
    login(page, "ADM001", "P1")
    body = page.locator("body").inner_text()
    check(7, "no Reset Demo Data button", "Reset Demo Data" not in body)
    nav = [t.strip() for t in page.locator("aside nav a").all_inner_texts() if t.strip()]
    expected = ["Dashboard", "Equipment Master", "Asset Requests", "Inventory Report", "Requests",
                "Periodic Review Management", "Preventive Maintenance Management", "Backup Schedule Management",
                "Password Vault", "User Management", "Audit Trail", "Notifications"]
    check(8, "left menu order as specified", nav == expected, nav)
    check(26, "Approver Master removed from menu", "Approver Master" not in nav)
    check(24, "selected plant shown in header", "Plant P1" in body)
    # search (row 4)
    page.keyboard.press("Control+k")
    page.get_by_placeholder("Search pages, equipment, request numbers...").fill("Backup")
    page.wait_for_timeout(500)
    hit = page.locator("button", has_text="Backup Schedule Management").last
    check(4, "header search finds pages", hit.count() > 0)
    hit.click()
    page.wait_for_url(re.compile(r".*/backup-schedule"))
    check(4, "search result navigates", "/backup-schedule" in page.url, page.url)
    # user menu (row 5) + about (row 6)
    page.locator("header button[aria-haspopup='menu']").click()
    menu = page.locator("[role='menu']").inner_text()
    check(5, "down arrow opens user menu", "About" in menu and "Sign out" in menu and "Change password" in menu, menu)
    shot(page, "02-user-menu")
    page.get_by_role("menuitem", name="About").click()
    page.wait_for_url(re.compile(r".*/about"))
    about = page.locator("main").inner_text()
    check(6, "About page", "VERSION" in about.upper() and "Air Care Zone" in about, about[:120])
    shot(page, "03-about")


@section("equipment")
def t_equipment(page: Page):
    page.goto(f"{BASE}/equipment")
    page.wait_for_load_state("networkidle")
    body = page.locator("main").inner_text()
    check(9, "subtitle without 'validated'", "Register assets and define the roles" in body and "validated assets" not in body)
    heads = page.locator("main table thead th").all_inner_texts()
    heads = [h.strip() for h in heads]
    check(13, "'Validation Status' column", "VALIDATION STATUS" in [h.upper() for h in heads], heads)
    check(14, "'Periodic Review Freq.' column", any("PERIODIC REVIEW FREQ" in h.upper() for h in heads), heads)
    check(23, "plant filter", page.locator("select[aria-label='Plant filter']").count() == 1)
    check(12, "system type filter", page.locator("select[aria-label='System type filter']").count() == 1)
    page.locator("select[aria-label='System type filter']").select_option("Software")
    page.wait_for_timeout(300)
    types = page.locator("main table tbody tr").count()
    check(12, "system type filter applies", types >= 1)
    page.locator("select[aria-label='System type filter']").select_option("")
    page.get_by_role("button", name="Columns").click()
    page.get_by_label("Computer System ID").check()
    page.wait_for_timeout(300)
    heads2 = [h.strip().upper() for h in page.locator("main table thead th").all_inner_texts()]
    check(10, "column picker adds a column", "COMPUTER SYSTEM ID" in heads2, heads2)
    page.keyboard.press("Escape")
    page.mouse.click(5, 5)
    codes = page.locator("main table tbody tr td:first-child").all_inner_texts()
    shot(page, "04-equipment")

    page.get_by_role("button", name="Add equipment").click()
    drawer = page.locator("div.fixed.inset-0").last
    labels = [l.strip() for l in drawer.locator("span.uppercase").all_inner_texts()]
    order = [re.sub(r"^\d+\.\s*", "", l).rstrip(" *").upper() for l in labels if re.match(r"^\d+\.", l)]
    expected = ["EQUIPMENT NAME", "TYPE", "PLANT", "APPLICATION NAME", "COMPUTER SYSTEM ID",
                "INSTRUMENT / EQUIPMENT / CONNECTED INSTRUMENT IDS", "MAKE", "MODEL", "SYSTEM TYPE", "GAMP CATEGORY",
                "USP CLASSIFICATION", "ALLOWED ROLES", "DEPARTMENT", "VALIDATION STATUS", "VALIDATION COMPLETION DATE",
                "INITIAL VALIDATION DATE", "LATEST VALIDATION DATE", "PERIODIC REVIEW FREQ. (MONTHS)", "INCLUDE IN BACKUP", "REMARKS"]
    check(18, "new equipment fields in the 20-field order", order == expected, order)
    gamp = drawer.locator("select").nth(3).locator("option").all_inner_texts()
    check(42, "GAMP options 1,3,4,5 only", gamp == ["Category 1", "Category 3", "Category 4", "Category 5"], gamp)
    inputs = drawer.locator("input:not([type=checkbox])")
    inputs.nth(0).fill(f"UI Test HPLC {TAG}")                      # name
    drawer.locator("select").first.select_option("Instrument")       # type
    drawer.locator("input").nth(2).fill(f"CS-UI-{TAG}")             # computer system id (after app name)
    drawer.get_by_placeholder("Type a role (e.g. Analyst) and press Enter").fill("Analyst")
    drawer.get_by_placeholder("Type a role (e.g. Analyst) and press Enter").press("Enter")
    dept = drawer.locator("select").filter(has=page.locator("option", has_text="Select department"))
    check(19, "allowed roles typed as free text", drawer.locator("text=Analyst").count() >= 1)
    check(33, "department is a dropdown", dept.count() == 1)
    dept.select_option("R&D")
    drawer.locator("input[type=date]").first.fill("2026-10-18")
    drawer.locator("select").filter(has=page.locator("option", has_text="Under Validation")).select_option("validated")
    drawer.get_by_role("button", name="Save").click()
    msg = toast_text(page)
    check(25, "saving as Validated before approval is refused", "only be set to 'Validated'" in msg, msg[-300:])
    drawer.locator("select").filter(has=page.locator("option", has_text="Under Validation")).select_option("under_validation")
    drawer.get_by_role("button", name="Save").click()
    msg = toast_text(page)
    m = re.search(r"Equipment (\d{4}) created", msg)
    check(11, "new equipment gets a numeric code", m is not None, msg[-300:])
    check(20, "save works (no 'Failed to fetch')", "Failed to fetch" not in msg)
    check(45, "asset request raised for new equipment", "asset creation request was raised" in msg)
    globals()["NEW_CODE"] = m.group(1) if m else None
    shot(page, "05-equipment-created")

    # confirm pop-up before retire (row 15)
    row = page.locator("main table tbody tr", has_text=f"UI Test HPLC {TAG}")
    row.get_by_role("button", name=re.compile("Retire")).click()
    dlg = page.locator("div.fixed.inset-0").last.inner_text()
    check(15, "confirmation pop-up before retire", "Do you want to retire the equipment" in dlg, dlg[:150])
    page.get_by_role("button", name="Cancel").click()

    # audit old/new (rows 16, 21)
    page.goto(f"{BASE}/audit")
    page.wait_for_load_state("networkidle")
    heads = [h.strip().upper() for h in page.locator("main table thead th").all_inner_texts()]
    check(16, "audit trail has Old Value / New Value", "OLD VALUE" in heads and "NEW VALUE" in heads, heads)
    first_ts = page.locator("main table tbody tr td").first.inner_text()
    check(17, "audit timestamp DD/MM/YYYY HH:mm (24h)", re.match(r"^\d{2}/\d{2}/\d{4} \d{2}:\d{2}$", first_ts.strip()) is not None, first_ts)
    shot(page, "06-audit")


@section("users")
def t_users(page: Page):
    page.goto(f"{BASE}/users")
    page.wait_for_load_state("networkidle")
    body = page.locator("main").inner_text()
    check(30, "total users displayed", re.search(r"Total users: \d+", body) is not None)
    check(29, "user search box", page.get_by_placeholder(re.compile("Search by name")).count() == 1)
    page.get_by_placeholder(re.compile("Search by name")).fill("HOD")
    page.wait_for_timeout(300)
    names = page.locator("main table tbody tr td:first-child").all_inner_texts()
    check(29, "search filters users", names and all("HOD" in n for n in names), names)
    page.get_by_placeholder(re.compile("Search by name")).fill("")
    check(28, "import from AD / ERP option", page.get_by_role("button", name=re.compile("Import from AD")).count() == 1)
    page.get_by_role("button", name=re.compile("Add local user")).click()
    box = page.locator("div.fixed.inset-0 div.rounded-2xl").last.bounding_box()
    vh = page.viewport_size["height"]
    check(32, "add user pop-up centred and fully visible", box and box["y"] >= 0 and box["y"] + box["height"] <= vh, box)
    dlg = page.locator("div.fixed.inset-0").last
    roles = dlg.locator("select").last.locator("option").all_inner_texts()
    check(31, "roles: Initiator, Reviewer, QA Approver, IT Executor, Inventory Requestor (IT removed)",
          roles == ["Initiator", "Reviewer", "QA Approver", "IT Executor", "Inventory Requestor"], roles)
    check(38, "password field on user creation", dlg.locator("input[type=password]").count() == 1)
    labels = [l.upper() for l in dlg.locator("span.uppercase").all_inner_texts()]
    check(33, "plant chosen before department", labels.index("PRIMARY PLANT *") < labels.index("DEPARTMENT *"), labels)
    shot(page, "07-add-user")
    page.keyboard.press("Escape")
    dlg.get_by_role("button", name="Cancel").click()


@section("inventory")
def t_inventory(page: Page):
    page.goto(f"{BASE}/inventory")
    page.wait_for_load_state("networkidle")
    body = page.locator("main").inner_text()
    check(36, "print / export PDF available, CSV export removed", "Export PDF" in body and "Print" in body and "Export CSV" not in body)
    sys_types = page.locator("select").nth(2).locator("option").all_inner_texts()
    check(35, "inventory filter by System Type", "All System Types" in sys_types, sys_types)
    check(40, "column selection in header", page.get_by_role("button", name="Columns").count() == 1)
    page.emulate_media(media="print")
    hdr = page.locator(".print-header").first
    check(37, "print header: logos, report name, format no.", hdr.is_visible() and "Format No" in hdr.inner_text(), hdr.inner_text() if hdr.count() else "")
    ftr = page.locator(".print-footer").first.inner_text()
    check(37, "print footer: printed by + date/time", "Printed by" in ftr and DATE_RE.search(ftr) is not None, ftr)
    shot(page, "08-inventory-print")
    page.emulate_media(media="screen")
    check(43, "Active / Retired wording", "Retired" in body and "Inactive" not in body)


@section("pm")
def t_pm(page: Page):
    page.goto(f"{BASE}/preventive-maintenance")
    page.wait_for_load_state("networkidle")
    heads = [h.strip().upper() for h in page.locator("main table thead th").all_inner_texts()]
    check(50, "PM shows 'Computer System ID'", "COMPUTER SYSTEM ID" in heads, heads)
    code = globals().get("NEW_CODE")
    check(18, "equipment with Computer System ID is on PM list", code and page.locator("main table tbody tr", has_text=code).count() == 1, code)
    # add additional system (row 52)
    page.get_by_role("button", name=re.compile("Add system")).click()
    dlg = page.locator("div.fixed.inset-0").last
    dlg.locator("input").nth(0).fill(f"File Server {TAG}")
    dlg.locator("input").nth(1).fill("SRV-01")
    dlg.locator("input").nth(2).fill("CS-SRV-01")
    dlg.get_by_role("button", name=re.compile("Add|Save")).last.click()
    page.wait_for_timeout(1500)
    row = page.locator("main table tbody tr", has_text=f"File Server {TAG}")
    check(52, "additional system added to PM list", row.count() == 1)
    # mark done with e-signature (rows 53, 64)
    row.get_by_role("button", name=re.compile("Mark done")).click()
    form = page.locator("div.fixed.inset-0").last
    check(64, "mark-done form visible (not hidden behind dialog)", form.locator("input[type=date]").first.is_visible())
    form.get_by_role("button", name=re.compile("Save|Continue|Next")).last.click()
    page.wait_for_timeout(400)
    cred = page.locator("div.fixed.inset-0").last.inner_text()
    check(64, "update asks for user ID and password", "USER ID" in cred.upper() and "PASSWORD" in cred.upper(), cred[:150])
    esign(page)
    page.wait_for_timeout(1500)
    row = page.locator("main table tbody tr", has_text=f"File Server {TAG}")
    check(52, "additional system marked done", DATE_RE.search(row.inner_text()) is not None, row.inner_text())
    row.get_by_role("button", name=re.compile("History")).click()
    page.wait_for_timeout(2500)
    hist = page.locator("div.fixed.inset-0").last.inner_text()
    check(55, "PM history shows activity", DATE_RE.search(hist) is not None, hist[:200])
    shot(page, "09-pm-history")
    page.locator("div.fixed.inset-0").last.get_by_role("button", name="Close", exact=True).last.click()
    page.wait_for_timeout(300)
    page.locator("main").get_by_role("button", name=re.compile("Planner")).first.click()
    page.wait_for_timeout(1500)
    plan = page.locator("div.fixed.inset-0").last.inner_text()
    check(51, "PM planner monthly / yearly", "MONTH" in plan.upper() and "YEAR" in plan.upper(), plan[:150])
    check(54, "planner can be printed", "Print" in plan)
    shot(page, "10-pm-planner")


@section("backup")
def t_backup(page: Page):
    page.goto(f"{BASE}/backup-schedule")
    page.wait_for_load_state("networkidle")
    body = page.locator("main").inner_text()
    check(56, "no last / next backup fields", "Last backup" not in body and "Next backup" not in body and "LAST BACKUP" not in body.upper())
    check(61, "backup search", page.get_by_placeholder(re.compile("Search")).count() >= 1)
    check(60, "backup filters type + department", page.locator("main select").count() >= 2)
    check(59, "backup report download", "Export" in body)
    row = page.locator("main table tbody tr").first
    row.get_by_role("button", name=re.compile("Mark done")).click()
    form = page.locator("div.fixed.inset-0").last
    freq = form.locator("input[type=number]").first
    check(57, "backup frequency editable", freq.is_visible() and freq.is_editable())
    path = form.get_by_placeholder(re.compile("Backup", re.I))
    check(58, "backup path field", path.count() >= 1)
    freq.fill("14")
    path.first.fill(r"D:\Backups\UI")
    form.get_by_role("button", name=re.compile("Save|Continue|Next")).last.click()
    page.wait_for_timeout(300)
    esign(page)
    page.wait_for_timeout(1500)
    row_text = page.locator("main table tbody tr").first.inner_text()
    check(58, "backup path + frequency saved", "D:\\Backups\\UI" in row_text and "14" in row_text, row_text)
    shot(page, "11-backup")


@section("periodic")
def t_periodic(page: Page):
    page.goto(f"{BASE}/periodic-review")
    page.wait_for_load_state("networkidle")
    body = page.locator("main").inner_text()
    check(65, "under-validation systems not listed", "UV Spectrophotometer" not in body)
    check(68, "periodic review filters type + department", page.locator("main select").count() >= 2)
    check(67, "periodic review report download", "Export" in body)
    row = page.locator("main table tbody tr").first
    row.get_by_role("button", name=re.compile("Mark done")).click()
    page.locator("div.fixed.inset-0").last.get_by_role("button", name=re.compile("Save|Continue|Next")).last.click()
    page.wait_for_timeout(300)
    esign(page)
    page.wait_for_timeout(1500)
    check(70, "periodic review updated with e-signature", DATE_RE.search(page.locator("main table tbody tr").first.inner_text()) is not None)
    page.locator("main").get_by_role("button", name=re.compile("Planner")).first.click()
    page.wait_for_timeout(1500)
    plan = page.locator("div.fixed.inset-0").last.inner_text()
    check(69, "periodic review planner monthly / yearly", "MONTH" in plan.upper() and "YEAR" in plan.upper(), plan[:200])
    check(66, "planner printable", "Print" in plan)
    shot(page, "12-periodic")


@section("vault")
def t_vault(page: Page):
    page.goto(f"{BASE}/vault")
    page.wait_for_load_state("networkidle")
    if page.locator("main table").count() == 0:
        page.get_by_role("button", name=re.compile("Add entry")).click()
        page.get_by_placeholder("EQ-001").fill("0001")
        page.get_by_placeholder("HPLC System").fill("UI vault entry")
        page.locator("main input[type=password]").first.fill("Secret#1")
        page.get_by_role("button", name=re.compile("Save entry")).click()
        page.wait_for_timeout(1500)
    heads = [h.strip().upper() for h in page.locator("main table thead th").all_inner_texts()]
    check(47, "'Created / Last Updated Date' column", any("CREATED" in h and "LAST UPDATED" in h for h in heads), heads)
    check(49, "vault search box", page.get_by_placeholder(re.compile("Search")).count() >= 1)
    body = page.locator("main").inner_text()
    check(46, "vault notifies 10 days before expiry", "10 days" in body)


@section("requests")
def t_requests(page: Page):
    code = globals().get("NEW_CODE")
    # The new equipment is in R&D (EMP001's department)
    login(page, "EMP001", "P1")
    page.goto(f"{BASE}/uam/requests")
    page.wait_for_load_state("networkidle")
    check(73, "page named Requests", page.locator("main h1").first.inner_text().strip() == "Requests")
    page.goto(f"{BASE}/uam/requests/new")
    page.wait_for_load_state("networkidle")
    main = page.locator("main")
    tmpl = main.locator("select").first.locator("option").all_inner_texts()
    check(73, "folder / project template", any("Folder" in t for t in tmpl), tmpl)
    eq_select = main.locator("select").filter(has=page.locator(f"option[value='{code}']"))
    check(74, "equipment selectable from dropdown", eq_select.count() == 1, code)
    eq_select.select_option(code)
    page.wait_for_timeout(300)
    role_select = main.locator("select").filter(has=page.locator("option[value='Analyst']"))
    check(75, "role auto-populated from equipment", role_select.count() == 1 and role_select.input_value() == "Analyst")
    action_select = main.locator("select").filter(has=page.locator("option[value='MODIFY']"))
    action_select.select_option("MODIFY")
    page.wait_for_timeout(300)
    check(76, "non-create action blocked without existing user ID", "does not exist" in main.inner_text())
    action_select.select_option("CREATE")
    main.locator("select").filter(has=page.locator("option[value='HOD001']")).first.select_option("HOD001")
    main.locator("select").filter(has=page.locator("option[value='QA001']")).first.select_option("QA001")
    ex = main.locator("select").filter(has=page.locator("option[value='ADM001']"))
    if ex.count():
        ex.first.select_option("ADM001")
    main.locator("textarea").first.fill("UI test access request")
    main.get_by_role("button", name=re.compile("Submit")).click()
    cred = page.locator("div.fixed.inset-0").last.inner_text()
    check(78, "submit asks for user ID, password and reason", all(k in cred.upper() for k in ("USER ID", "PASSWORD", "REASON")), cred[:150])
    esign(page, "Initial access")
    page.wait_for_url(re.compile(r".*/uam/requests/\d{2}-\d{6}$"), timeout=20000)
    req_code = page.url.rsplit("/", 1)[-1]
    page.wait_for_load_state("networkidle")
    page.locator("main h1").first.wait_for()
    page.wait_for_timeout(1500)
    check(72, "request number YY-NNNNNN", re.match(r"^\d{2}-\d{6}$", req_code) is not None, req_code)
    body = page.locator("main").inner_text()
    check(77, "initiator cannot comment while request waits on reviewer", "Waiting on" in body and page.locator("main textarea").count() == 0, body[:300])
    shot(page, "13-request-submitted")

    login(page, "HOD001", "P1")
    page.goto(f"{BASE}/uam/requests/{req_code}")
    page.wait_for_load_state("networkidle")
    page.locator("main textarea").first.fill("Reviewed OK")
    page.locator("main").get_by_role("button", name=re.compile("^Approve")).click()
    esign(page, "Reviewed")
    page.wait_for_timeout(2000)
    body = page.locator("main").inner_text()
    check(78, "review e-signed, moves to QA", "QA" in body)
    check(79, "comment box locked after status moves forward", page.locator("main textarea").count() == 0)
    check(80, "reviewer can no longer reject / send back", page.locator("main").get_by_role("button", name=re.compile("Reject|Correction|Send back")).count() == 0)
    shot(page, "14-after-review")

    login(page, "QA001", "P1")
    page.goto(f"{BASE}/uam/requests/{req_code}")
    page.wait_for_load_state("networkidle")
    page.locator("main").get_by_role("button", name=re.compile("^Approve")).click()
    esign(page, "QA approved")
    page.wait_for_timeout(2000)
    check(78, "QA approval e-signed", "execution" in page.locator("main").inner_text().lower())

    login(page, "ADM001", "P1")
    page.goto(f"{BASE}/uam/requests/{req_code}")
    page.wait_for_load_state("networkidle")
    main = page.locator("main")
    main.locator("input").nth(0).fill("emp001.hplc")
    main.locator("input[type=password]").first.fill("Temp@1234")
    main.get_by_role("button", name=re.compile("Complete execution|Execute")).click()
    esign(page, "Account created")
    page.wait_for_timeout(2000)
    check(31, "IT Executor (Admin) completes execution", "acknowledg" in page.locator("main").inner_text().lower())
    shot(page, "15-executed")

    page.goto(f"{BASE}/asset-requests")
    page.wait_for_load_state("networkidle")
    body = page.locator("main").inner_text()
    check(72, "asset requests numbered AST-YY-NNNNNN", re.search(r"AST-\d{2}-\d{6}", body) is not None)
    shot(page, "16-asset-requests")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.set_default_timeout(15000)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        # warm-up: the Vite dev server optimises dependencies on first load and reloads
        for _ in range(3):
            try:
                page.goto(f"{BASE}/login", wait_until="networkidle", timeout=90000)
                page.wait_for_timeout(3000)
            except Exception:  # noqa: BLE001
                pass
        t_login(page)
        t_shell(page)
        t_equipment(page)
        t_users(page)
        t_inventory(page)
        t_pm(page)
        t_backup(page)
        t_periodic(page)
        t_vault(page)
        t_requests(page)
        check("-", "no JavaScript errors in the browser", not errors, errors[:3])
        browser.close()
    failed = [r for r in results if not r[2]]
    print(f"\n{len(results) - len(failed)}/{len(results)} UI checks passed")
    (OUT / "results.tsv").write_text("\n".join("\t".join(map(str, r)) for r in results), encoding="utf8")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
