# Sentinel-1 and Sentinel-2 Malaysia Viewer

This is a small Python script that searches the Copernicus Data Space catalogue for Sentinel-1 radar and Sentinel-2 optical products over a location in Malaysia, then creates an HTML map you can open in a browser.

It defaults to Kuala Lumpur:

```bash
python3 sentinel_viewer.py
```

Use your own location:

```bash
python3 sentinel_viewer.py --lat 5.4141 --lon 100.3288 --place "Penang, Malaysia" --radius-km 15
```

Use a different date range:

```bash
python3 sentinel_viewer.py --start 2026-03-01 --end 2026-05-25
```

The script writes `sentinel_viewer.html` and tries to open it automatically. If you only want to create the file:

```bash
python3 sentinel_viewer.py --no-open
```

## Downloading A Full Product

Catalogue search and quicklook viewing do not need a login. Full Sentinel products can be large and require a free Copernicus Data Space Ecosystem account.

Set your credentials, then pass a product ID from the HTML viewer:

```bash
export CDSE_USERNAME="your@email"
export CDSE_PASSWORD="your-password"
python3 sentinel_viewer.py --download PRODUCT_ID_FROM_VIEWER
```

Downloads are saved under `downloads/`.

## Useful Options

- `--lat` and `--lon`: center point for the search.
- `--radius-km`: area around the point.
- `--s1-type`: Sentinel-1 product type, default `IW_GRDH_1S`.
- `--s2-type`: Sentinel-2 product type, default `S2MSI2A`.
- `--limit`: number of products per mission.

## Data Source

The script uses the Copernicus Data Space OData catalogue:

https://catalogue.dataspace.copernicus.eu/odata/v1/Products
