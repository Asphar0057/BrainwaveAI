import ast
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_every_question_bank_route_requires_auth_and_scope_enforcement():
    source = (BACKEND_ROOT / "question_bank" / "routes.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    route_count = 0

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            if not isinstance(decorator, ast.Call) or not isinstance(decorator.func, ast.Attribute):
                continue
            if not isinstance(decorator.func.value, ast.Name) or decorator.func.value.id != "app":
                continue
            if decorator.func.attr not in {"get", "post", "put", "patch", "delete"}:
                continue

            route_count += 1
            dependency_keywords = {
                keyword.arg: ast.unparse(keyword.value)
                for keyword in decorator.keywords
                if keyword.arg
            }
            assert dependency_keywords.get("dependencies") == "_QB_AUTH_DEPENDENCIES", (
                f"Question Bank route {node.name} must require the shared authentication "
                "and user-scope dependencies"
            )

    assert route_count >= 30, "Question Bank routes were not discovered"


def test_question_bank_security_dependency_set_contains_both_guards():
    source = (BACKEND_ROOT / "question_bank" / "routes.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    assignments = {
        target.id: ast.unparse(node.value)
        for node in tree.body
        if isinstance(node, ast.Assign)
        for target in node.targets
        if isinstance(target, ast.Name)
    }
    guards = assignments.get("_QB_AUTH_DEPENDENCIES", "")
    assert "Depends(get_current_user)" in guards
    assert "Depends(enforce_request_user_scope)" in guards


def test_development_otps_are_never_logged_or_returned_in_production():
    source = (BACKEND_ROOT / "routes" / "auth.py").read_text(encoding="utf-8")
    tree = ast.parse(source)

    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if isinstance(node.func.value, ast.Name) and node.func.value.id == "logger":
                assert all(ast.unparse(arg) != "otp" for arg in node.args), "OTP must never be logged"

        if isinstance(node, ast.If) and any(
            isinstance(child, ast.Constant) and child.value == "dev_otp"
            for child in ast.walk(node)
        ):
            assert "not _is_production()" in ast.unparse(node.test)

    assert 'os.getenv("APP_ENV"' not in source.replace(
        'os.getenv("ENVIRONMENT") or os.getenv("APP_ENV")',
        'os.getenv("ENVIRONMENT")',
    )


def test_firebase_authentication_never_skips_token_verification():
    source = (BACKEND_ROOT / "routes" / "auth.py").read_text(encoding="utf-8")
    assert "skipping Firebase token verification" not in source
    assert "firebase_auth.verify_id_token(id_token)" in source
    assert 'raise HTTPException(status_code=503, detail="Firebase authentication is not configured")' in source


def test_paid_subscription_tiers_cannot_be_selected_directly():
    auth_source = (BACKEND_ROOT / "routes" / "auth.py").read_text(encoding="utf-8")
    subscription_source = (BACKEND_ROOT / "routes" / "subscription.py").read_text(encoding="utf-8")
    assert "Paid plans must be activated through subscription checkout." in auth_source
    assert 'raise HTTPException(status_code=503, detail="This paid plan is not configured for checkout.")' in subscription_source
    assert "manual_invoice" not in subscription_source
    assert 'payload.get("success_url")' not in subscription_source
