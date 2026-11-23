import json
from pathlib import Path
import sys

# Ensure backend/ is on sys.path when invoked from project root or backend/
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import app  # noqa: E402


def export_openapi_spec(output_path: Path) -> dict:
    schema = app.openapi()

    # Basic structural OpenAPI 3.x validation checks
    assert "openapi" in schema and schema["openapi"].startswith("3."), "Missing OpenAPI 3.x version"
    assert "paths" in schema and len(schema["paths"]) > 0, "OpenAPI schema has no paths"
    assert "/api/v1/classify" in schema["paths"], "Missing /api/v1/classify path"
    assert "/api/v1/webhooks/ticket-created" in schema["paths"], "Missing /api/v1/webhooks/ticket-created path"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
    return schema


if __name__ == "__main__":
    project_root = BACKEND_DIR.parent
    out_file = project_root / "docs" / "openapi.json"
    spec = export_openapi_spec(out_file)
    print(f"Exported valid OpenAPI {spec['openapi']} spec ({len(spec['paths'])} paths) -> {out_file}")