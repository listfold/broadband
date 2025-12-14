# FCC Broadband Data Collection (BDC) - Maryland Data Summary

**Source:** [FCC Nationwide Data Download](https://broadbandmap.fcc.gov/data-download/nationwide-data?version=jun2025)
**Data Period:** June 2025 (J25)
**State Scope:** Maryland (some files contain national data)
**Downloaded:** November 22, 2025

---

## Fixed Broadband Files (Location-Level Data)

| Filename | Description |
|----------|-------------|
| `bdc_24_Cable_fixed_broadband_J25_22nov2025.csv` | Cable broadband service availability by location. Contains provider info (FRN, provider_id, brand_name), location_id, technology code (40=Cable), advertised download/upload speeds, latency, and geographic identifiers (state, census block, H3 hex). |
| `bdc_24_Copper_fixed_broadband_J25_22nov2025.csv` | Copper/DSL broadband service availability by location. Same structure as Cable file but with technology code 10 (Copper). Covers legacy telephone-based broadband. |
| `bdc_24_FibertothePremises_fixed_broadband_J25_22nov2025.csv` | Fiber-to-the-Premises (FTTP) broadband availability by location. Technology code 50. Generally offers highest speeds (symmetrical gigabit+). |
| `bdc_24_GSOSatellite_fixed_broadband_J25_22nov2025.csv` | Geostationary Satellite (GSO) broadband availability. Technology code 60. Providers like HughesNet. Higher latency (low_latency=0). |
| `bdc_24_NGSOSatellite_fixed_broadband_J25_22nov2025.csv` | Non-Geostationary Satellite (NGSO) broadband availability. Technology code 61. Includes Starlink. Lower latency than GSO. |
| `bdc_24_LBRFixedWireless_fixed_broadband_J25_22nov2025.csv` | Licensed-by-Rule Fixed Wireless broadband. Technology code 72. Small wireless ISPs operating under FCC license-by-rule framework. |
| `bdc_24_LicensedFixedWireless_fixed_broadband_J25_22nov2025.csv` | Licensed Fixed Wireless broadband. Technology code 71. Includes carriers like Verizon using licensed spectrum. |
| `bdc_24_UnlicensedFixedWireless_fixed_broadband_J25_22nov2025.csv` | Unlicensed Fixed Wireless broadband. Technology code 70. WISPs using unlicensed spectrum bands. |

## Fixed Broadband Summary Files

| Filename | Description |
|----------|-------------|
| `bdc_24_fixed_broadband_summary_by_geography_place_J25_22nov2025.csv` | Aggregated fixed broadband availability statistics by Census Place (city/town). Shows percentage of units with service at various speed tiers (2/2, 10/1, 25/3, 100/20, 250/25, 1000/100 Mbps) by technology type and residential/business classification. |

## Mobile Broadband Files (H3 Hexagon Shapefiles)

| Filename | Description |
|----------|-------------|
| `bdc_24_4GLTE_mobile_broadband_h3_J25_22nov2025.*` | 4G LTE mobile broadband coverage. Shapefile set (.shp, .shx, .dbf, .prj) with H3 resolution 8 hexagons showing coverage areas. WGS 1984 coordinate system. |
| `bdc_24_5GNR_mobile_broadband_h3_J25_22nov2025.*` | 5G NR (New Radio) mobile broadband coverage. Shapefile set with H3 hexagon geometries showing 5G service availability. |
| `bdc_24_MobileVoice_mobile_voice_h3_J25_22nov2025.*` | Mobile voice service coverage. Shapefile set with H3 hexagon geometries for voice coverage analysis. |

## Mobile Broadband Summary Files

| Filename | Description |
|----------|-------------|
| `bdc_24_mobile_broadband_summary_by_geography_place_J25_22nov2025.csv` | Mobile broadband availability statistics by Census Place. Shows area coverage percentages for 3G, 4G, and 5G (at different speed tiers) for both stationary and in-vehicle use cases. |

## Provider Information Files (National Data)

| Filename | Description |
|----------|-------------|
| `bdc_us_provider_list_J25_22nov2025.csv` | National list of broadband providers. Maps FRN (FCC Registration Number) to provider_id and holding company name. |
| `bdc_us_provider_summary_by_geography_J25_22nov2025.csv` | National provider coverage summary by geography (CBSA/MSA). Shows residential and business coverage percentages for each provider in each geographic area. |
| `bdc_us_fixed_broadband_provider_summary_J25_22nov2025.csv` | National fixed broadband provider summary. Counts of locations/units served by each provider, broken down by technology type and residential/business classification. |
| `bdc_us_mobile_broadband_provider_summary_J25_22nov2025.csv` | National mobile broadband provider summary. Coverage area (sq km) for each provider by technology (4G LTE, 5G) for stationary and in-vehicle scenarios. |

---

## Key Field Definitions

- **FRN**: FCC Registration Number (unique provider identifier)
- **location_id**: FCC Fabric location identifier
- **technology**: Technology code (10=Copper, 40=Cable, 50=Fiber, 60=GSO Satellite, 61=NGSO Satellite, 70=Unlicensed FW, 71=Licensed FW, 72=LBR FW, 400=4G LTE, 500=5G NR)
- **max_advertised_download_speed / max_advertised_upload_speed**: Speeds in Mbps
- **low_latency**: 1=low latency, 0=high latency
- **business_residential_code**: R=Residential, B=Business, X=Both
- **block_geoid**: Census block FIPS code
- **h3_res8_id**: H3 hexagonal index at resolution 8
