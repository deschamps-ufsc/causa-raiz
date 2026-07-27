"""
Adds a full-function try/except wrapper around get_mapa_heatmap.
The outer try starts right after the docstring.
The except is added right before the next @router decorator.
"""
import re

filepath = "e:/Antigravity/Causa Raiz/backend/routes/heatmap.py"

with open(filepath, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Find the function boundaries
func_start = None  # line after docstring closing """
func_end = None    # line before next @router.get

in_func = False
docstring_done = False
docstring_count = 0

for i, line in enumerate(lines):
    stripped = line.strip()
    
    if stripped.startswith("def get_mapa_heatmap("):
        in_func = True
        continue
    
    if in_func and not docstring_done:
        if '"""' in stripped:
            docstring_count += 1
            if docstring_count >= 2 or (stripped.startswith('"""') and stripped.endswith('"""') and len(stripped) > 3):
                docstring_done = True
                func_start = i + 1  # line after closing """
                continue
            elif stripped == '"""':
                docstring_done = True
                func_start = i + 1
                continue
    
    if in_func and docstring_done:
        # Look for the next @router or def at column 0
        if stripped.startswith("@router.") and not line.startswith("    "):
            func_end = i
            break

if func_start is None or func_end is None:
    print(f"ERROR: Could not find function boundaries. start={func_start}, end={func_end}")
    exit(1)

print(f"Function body: lines {func_start+1} to {func_end}")

# Check if there's already a try: at the start
first_line = lines[func_start].strip()
if first_line == "try:":
    print("Already has try: at start, removing it first")
    # Remove the existing try line
    lines.pop(func_start)
    func_end -= 1

# Now check for existing except blocks at the end
# Find the last non-empty line before func_end
last_content = func_end - 1
while last_content > func_start and lines[last_content].strip() == "":
    last_content -= 1

# Check if there's an except Exception block
# Walk backwards from last_content to find and remove old except blocks
remove_start = None
for i in range(last_content, func_start, -1):
    stripped = lines[i].strip()
    if stripped.startswith("except Exception"):
        remove_start = i
        break

if remove_start is not None:
    # Remove from except to func_end
    print(f"Removing old except block: lines {remove_start+1} to {func_end}")
    del lines[remove_start:func_end]
    func_end = remove_start

# Now re-indent all lines from func_start to func_end by adding 4 spaces
new_lines = []
for i, line in enumerate(lines):
    if func_start <= i < func_end:
        if line.strip() == "":
            new_lines.append(line)  # keep empty lines as-is
        else:
            new_lines.append("    " + line)
    else:
        new_lines.append(line)

# Insert try: before func_start
new_lines.insert(func_start, "    try:\n")

# Find where to insert except (after the re-indented block)
# func_end shifted by 1 due to the try: insertion
except_pos = func_end + 1
except_block = [
    "    except Exception as e:\n",
    "        import traceback\n",
    '        err_msg = f"Error in get_mapa_heatmap: {str(e)}\\n{traceback.format_exc()}"\n',
    "        print(err_msg)\n",
    '        with open("mapa_error.txt", "w") as f:\n',
    "            f.write(err_msg)\n",
    "        raise HTTPException(status_code=500, detail=str(e))\n",
    "\n",
]
for j, exc_line in enumerate(except_block):
    new_lines.insert(except_pos + j, exc_line)

with open(filepath, "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print("Done! Verifying syntax...")

import py_compile
try:
    py_compile.compile(filepath, doraise=True)
    print("Syntax OK!")
except py_compile.PyCompileError as e:
    print(f"Syntax Error: {e}")
