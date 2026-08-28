# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[('MPOB-3-all-black-fonts.png', '.'), ('MPOB-3_transparent.png', '.'), ('WhatsApp Image 2026-08-11 at 08.43.18.jpeg', '.'), ('Lahad Datu with block boundary.shp', '.'), ('Lahad Datu with block boundary.shx', '.'), ('Lahad Datu with block boundary.dbf', '.'), ('Lahad Datu with block boundary.prj', '.'), ('Merge_Citra_Unsur_N.tif', '.'), ('Merge_Citra_Unsur_P.tif', '.'), ('Merge_Citra_Unsur_K.tif', '.'), ('Merge_Citra_Unsur_Mg.tif', '.'), ('data', 'data')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='SmartPalm',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='SmartPalm',
)
app = BUNDLE(
    coll,
    name='SmartPalm.app',
    icon=None,
    bundle_identifier=None,
)
