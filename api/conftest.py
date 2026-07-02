"""pytest configuration — add api/ to sys.path for module imports."""
import sys
from pathlib import Path

api_root = Path(__file__).parent
if str(api_root) not in sys.path:
    sys.path.insert(0, str(api_root))
