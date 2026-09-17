"""Packaged-mode Python worker for sandbox scripts."""
import contextlib
import runpy
import sys
import traceback
from io import StringIO


def main() -> int:
    if len(sys.argv) != 2:
        print("Sandbox worker requires exactly one script path.", file=sys.stderr)
        return 2
    stdout, stderr = StringIO(), StringIO()
    try:
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            runpy.run_path(sys.argv[1], run_name="__main__")
        code = 0
    except SystemExit as exc:
        code = int(exc.code) if isinstance(exc.code, int) else 1
    except BaseException:
        traceback.print_exc(file=stderr)
        code = 1
    sys.stdout.write(stdout.getvalue())
    sys.stderr.write(stderr.getvalue())
    return code


if __name__ == "__main__":
    raise SystemExit(main())
