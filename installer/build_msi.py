import os
import sys
import uuid
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = BASE_DIR / "dist_pc" / "Coagent"
INSTALLER_DIR = BASE_DIR / "installer"
OUTPUT_DIR = BASE_DIR / "dist_installer"
APP_VERSION = "1.0.2"

INSTALLER_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def generate_wix_xml(dist_dir: Path, output_file: Path):
    print(f"[MSI Generator] Scanning distribution files in: {dist_dir}")
    if not dist_dir.exists():
        raise FileNotFoundError(f"Dist dir not found: {dist_dir}")

    # Build hierarchical directory tree
    root_node = {
        "id": "INSTALLFOLDER",
        "name": "Coagent",
        "children": {},
        "rel_path": Path(".")
    }

    dir_id_counter = 0
    dir_map = {Path("."): "INSTALLFOLDER"}

    # Discover all directories
    all_dirs = sorted([d.relative_to(dist_dir) for d in dist_dir.rglob("*") if d.is_dir()])
    for rel_d in all_dirs:
        dir_id_counter += 1
        d_id = f"DIR_{dir_id_counter}"
        dir_map[rel_d] = d_id
        
        parts = rel_d.parts
        curr = root_node
        accum_path = Path(".")
        for p in parts:
            accum_path = accum_path / p
            if p not in curr["children"]:
                curr["children"][p] = {
                    "id": dir_map.get(accum_path, f"DIR_{dir_id_counter}"),
                    "name": p,
                    "children": {},
                    "rel_path": accum_path
                }
            curr = curr["children"][p]

    def render_directory_tree(node, indent=6):
        lines = []
        prefix = " " * indent
        for name, child in sorted(node["children"].items()):
            lines.append(f'{prefix}<Directory Id="{child["id"]}" Name="{name}">')
            lines.extend(render_directory_tree(child, indent + 2))
            lines.append(f'{prefix}</Directory>')
        return lines

    dir_xml_lines = render_directory_tree(root_node, indent=8)

    # Harvest all files
    all_files = sorted([f for f in dist_dir.rglob("*") if f.is_file()])
    print(f"[MSI Generator] Found {len(all_files)} files across {len(all_dirs)} directories.")

    components = []
    comp_refs = []
    file_id_counter = 0

    for fpath in all_files:
        rel_f = fpath.relative_to(dist_dir)
        parent_rel_dir = rel_f.parent
        dir_id = dir_map[parent_rel_dir]

        file_id_counter += 1
        f_id = f"fil_{file_id_counter}"
        c_id = f"cmp_{file_id_counter}"
        comp_guid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"coagent.{rel_f.as_posix()}"))
        comp_refs.append(c_id)

        # Escape path for XML if necessary
        abs_source = str(fpath.resolve())

        components.append(
            f'    <Component Id="{c_id}" Directory="{dir_id}" Guid="{comp_guid}">\n'
            f'      <File Id="{f_id}" Source="{abs_source}" KeyPath="yes" />\n'
            f'    </Component>'
        )

    icon_abs = str((BASE_DIR / "desktop" / "icon.ico").resolve())

    # Shortcuts components
    desktop_guid = str(uuid.uuid5(uuid.NAMESPACE_DNS, "coagent.desktop.shortcut"))
    menu_guid = str(uuid.uuid5(uuid.NAMESPACE_DNS, "coagent.menu.shortcut"))

    comp_refs.append("cmp_desktop_shortcut")
    comp_refs.append("cmp_menu_shortcut")

    shortcut_components = [
        f'    <Component Id="cmp_desktop_shortcut" Directory="DesktopFolder" Guid="{desktop_guid}">\n'
        f'      <Shortcut Id="DesktopShortcut" Name="Coagent" Description="Coagent Autonomous Desktop Application" Target="[INSTALLFOLDER]Coagent.exe" WorkingDirectory="INSTALLFOLDER" Icon="AppIcon.ico" />\n'
        f'      <RegistryValue Root="HKCU" Key="Software\\Coagent" Name="DesktopShortcut" Type="integer" Value="1" KeyPath="yes" />\n'
        f'    </Component>',
        f'    <Component Id="cmp_menu_shortcut" Directory="ProgramMenuFolder" Guid="{menu_guid}">\n'
        f'      <Shortcut Id="StartMenuShortcut" Name="Coagent" Description="Coagent Autonomous Desktop Application" Target="[INSTALLFOLDER]Coagent.exe" WorkingDirectory="INSTALLFOLDER" Icon="AppIcon.ico" />\n'
        f'      <RegistryValue Root="HKCU" Key="Software\\Coagent" Name="StartMenuShortcut" Type="integer" Value="1" KeyPath="yes" />\n'
        f'    </Component>'
    ]

    # Full XML assembly
    wxs_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs"',
        '     xmlns:ui="http://wixtoolset.org/schemas/v4/wxs/ui">',
        '  <Package Name="Coagent"',
        '           Manufacturer="Coagent"',
        f'           Version="{APP_VERSION}"',
        '           UpgradeCode="4A1B2C3D-E5F6-7890-ABCD-EF1234567890"',
        '           Scope="perMachine">',
        '    <MajorUpgrade DowngradeErrorMessage="A newer version of [ProductName] is already installed." />',
        '    <MediaTemplate EmbedCab="yes" />',
        f'    <Icon Id="AppIcon.ico" SourceFile="{icon_abs}" />',
        '    <Property Id="ARPPRODUCTICON" Value="AppIcon.ico" />',
        '',
        '    <StandardDirectory Id="ProgramFiles64Folder">',
        '      <Directory Id="INSTALLFOLDER" Name="Coagent">',
    ]

    wxs_lines.extend(dir_xml_lines)

    wxs_lines.extend([
        '      </Directory>',
        '    </StandardDirectory>',
        '',
        '    <StandardDirectory Id="DesktopFolder" />',
        '    <StandardDirectory Id="ProgramMenuFolder" />',
        ''
    ])

    wxs_lines.extend(components)
    wxs_lines.append('')
    wxs_lines.extend(shortcut_components)
    wxs_lines.append('')
    wxs_lines.extend([
        '    <Property Id="WIXUI_EXITDIALOGOPTIONALCHECKBOXTEXT" Value="Launch Coagent" />',
        '    <Property Id="WIXUI_EXITDIALOGOPTIONALCHECKBOX" Value="1" />',
        '    <CustomAction Id="LaunchApplication" Directory="INSTALLFOLDER" ExeCommand="[INSTALLFOLDER]Coagent.exe" Return="asyncNoWait" />',
        '    <ui:WixUI Id="WixUI_InstallDir" InstallDirectory="INSTALLFOLDER" />',
        '    <UI>',
        '      <Publish Dialog="ExitDialog" Control="Finish" Event="DoAction" Value="LaunchApplication" Condition="WIXUI_EXITDIALOGOPTIONALCHECKBOX = 1 and NOT Installed" />',
        '    </UI>',
        ''
    ])
    wxs_lines.append('    <Feature Id="MainFeature" Title="Coagent Desktop Application" Level="1">')

    for cr in comp_refs:
        wxs_lines.append(f'      <ComponentRef Id="{cr}" />')

    wxs_lines.extend([
        '    </Feature>',
        '  </Package>',
        '</Wix>'
    ])

    output_file.write_text("\n".join(wxs_lines), encoding="utf-8")
    print(f"[MSI Generator] Generated WiX XML specification: {output_file}")


def build_msi():
    wxs_file = INSTALLER_DIR / "coagent.wxs"
    msi_file = OUTPUT_DIR / f"Coagent-{APP_VERSION}-x64.msi"

    generate_wix_xml(DIST_DIR, wxs_file)

    print(f"[MSI Generator] Compiling MSI using WiX toolset...")
    cmd = ["wix", "build", str(wxs_file), "-ext", "WixToolset.UI.wixext", "-arch", "x64", "-out", str(msi_file)]
    res = subprocess.run(cmd, capture_output=True, text=True)

    if res.returncode != 0:
        print("[MSI Build Error]", res.stderr)
        print("[MSI Build Stdout]", res.stdout)
        sys.exit(res.returncode)

    print(f"\n========================================================")
    print(f"[MSI Success] Windows MSI installer generated successfully!")
    print(f"  Installer: {msi_file.resolve()}")
    print(f"  Size:      {msi_file.stat().st_size / (1024*1024):.2f} MB")
    print(f"========================================================\n")


if __name__ == "__main__":
    build_msi()
