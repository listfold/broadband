# broadband_factsheet

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.3. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Data Files

The `data/` directory is excluded from git due to large CSV files. You'll need to obtain the following data files separately:

- **FCC Broadband Data Collection (BDC)**: Download from the [FCC BDC Public Data](https://broadbandmap.fcc.gov/data-download) page
- **Broadband Labels**: Available from the FCC broadband label data sources

Place the downloaded files in the `data/` directory structure:
- `data/maryland/` - State-specific BDC files
- `data/label/` - Broadband label templates and data dictionaries
