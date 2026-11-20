/**
 * ReaDA — Trial Annual Data
 * ---------------------------------------------------------------
 * Source: PORIM "ReaDA User's Manual", Lesson 1, Figure 2
 *         ("Trial Annual Data" form, manual page 2 / PDF page 8).
 *
 * In the original Visual dBase program this list is built automatically
 * from the default ReaDA data files (manual page ii):
 *   datainfo  -> trial information (code, estate, planting year)
 *   dataryld  -> trial recording yield
 *   dataffb   -> trial annual (FFB) yield data
 *   dataleaf  -> trial leaf nutrients data
 *   datavm    -> trial vegetative measurement data
 *   datasoil  -> trial soil nutrients data
 *
 * Date conventions (kept from the original form):
 *   - Period columns use  { mn, yr }  (Mn / Year)
 *   - Sampling columns use { dy, mn, yr } (Dy / Mn / Year)
 *   - A value of 0 ("00") means "not recorded" in the original data.
 *
 * Notes on the scanned figure:
 *   - Only the record for the selected (first) trial is visible in
 *     Figure 2, so only that trial has detail data below. The other
 *     trials are listed exactly as in the figure, with no saved records.
 *   - The scan shows "DTP1 / Teluk Intan" on two rows; both are kept.
 *   - "Ldg. Koko, Land..." and "Felcra Sg. Mong..." are truncated in
 *     the original form; they are reproduced as shown.
 *   - Leaf nutrient 1990 day is hard to read in the scan ("2?") — 20 used.
 *   - Planting year 1988 for DTP1 comes from Lesson 2, Figure 4.
 */
window.READA_TRIALS = [
  {
    code: 'DTP1',
    estate: 'Teluk Intan',
    plantingYear: 1988,
    factorsCount: 6,
    factors: [
      { id: 1, label: 'Rep', name: 'Replicate' },
      { id: 2, label: 'D',   name: 'Density' },
      { id: 3, label: 'N',   name: 'Nitrogen' },
      { id: 4, label: 'P',   name: 'Phosphorus' },
      { id: 5, label: 'K',   name: 'Potassium' },
      { id: 6, label: 'L',   name: 'Lime' }
    ],
    factorInfo: 'Rep = Replicate\nD   = Density\nN   = Nitrogen\nP   = Phosphorus\nK   = Potassium\nL   = Lime',
    densityType: 'varies', // 'constant' | 'varies'
    constantDensity: 148,
    recordingYield: [
      { from: { mn: 3, yr: 1997 }, to: { mn: 2, yr: 1998 } }
    ],
    ffbYield: [
      { from: { mn: 3, yr: 1988 }, to: { mn: 2, yr: 1989 } },
      { from: { mn: 3, yr: 1989 }, to: { mn: 2, yr: 1990 } },
      { from: { mn: 3, yr: 1990 }, to: { mn: 2, yr: 1991 } },
      { from: { mn: 3, yr: 1991 }, to: { mn: 2, yr: 1992 } },
      { from: { mn: 3, yr: 1992 }, to: { mn: 2, yr: 1993 } },
      { from: { mn: 3, yr: 1993 }, to: { mn: 2, yr: 1994 } },
      { from: { mn: 3, yr: 1994 }, to: { mn: 2, yr: 1995 } },
      { from: { mn: 3, yr: 1995 }, to: { mn: 2, yr: 1996 } },
      { from: { mn: 3, yr: 1996 }, to: { mn: 2, yr: 1997 } }
    ],
    leafNutrients: [
      { dy: 8,  mn: 5,  yr: 1988 },
      { dy: 6,  mn: 9,  yr: 1989 },
      { dy: 20, mn: 9,  yr: 1990 },
      { dy: 8,  mn: 10, yr: 1991 },
      { dy: 8,  mn: 12, yr: 1992 },
      { dy: 6,  mn: 12, yr: 1993 },
      { dy: 4,  mn: 10, yr: 1994 }
    ],
    vegetativeMeasurement: [
      { dy: 0, mn: 0, yr: 1988 },
      { dy: 0, mn: 0, yr: 1989 },
      { dy: 0, mn: 0, yr: 1990 },
      { dy: 0, mn: 0, yr: 1991 },
      { dy: 0, mn: 0, yr: 1992 },
      { dy: 0, mn: 0, yr: 1993 }
    ],
    soilNutrients: [
      { dy: 0, mn: 11, yr: 1988 },
      { dy: 0, mn: 12, yr: 1989 },
      { dy: 0, mn: 11, yr: 1990 },
      { dy: 0, mn: 4,  yr: 1993 }
    ],
    plotTreatments: [
      { rec: 1,  plot: 1,  subPlot: '',  levels: [1, 1, 0, 0, 0, 0], density: 160 },
      { rec: 2,  plot: 2,  subPlot: '',  levels: [1, 1, 0, 1, 1, 0], density: 160 },
      { rec: 3,  plot: 3,  subPlot: '',  levels: [1, 1, 0, 2, 2, 1], density: 160 },
      { rec: 4,  plot: 4,  subPlot: '',  levels: [1, 1, 0, 3, 3, 2], density: 160 },
      { rec: 5,  plot: 5,  subPlot: '',  levels: [1, 1, 1, 0, 1, 0], density: 160 },
      { rec: 6,  plot: 6,  subPlot: '',  levels: [1, 1, 1, 1, 2, 1], density: 160 },
      { rec: 7,  plot: 7,  subPlot: '',  levels: [1, 1, 1, 2, 3, 2], density: 160 },
      { rec: 8,  plot: 8,  subPlot: '',  levels: [1, 1, 1, 3, 0, 0], density: 160 },
      { rec: 9,  plot: 9,  subPlot: '',  levels: [1, 1, 2, 0, 2, 1], density: 160 },
      { rec: 10, plot: 10, subPlot: '',  levels: [1, 1, 2, 1, 3, 2], density: 160 },
      { rec: 11, plot: 11, subPlot: '',  levels: [1, 1, 2, 2, 0, 0], density: 160 },
      { rec: 12, plot: 12, subPlot: '',  levels: [1, 1, 2, 3, 1, 1], density: 160 },
      { rec: 13, plot: 13, subPlot: '',  levels: [1, 1, 0, 0, 1, 1], density: 160 },
      { rec: 14, plot: 14, subPlot: 'A', levels: [1, 1, 1, 1, 2, 1], density: 160 },
      { rec: 15, plot: 14, subPlot: 'B', levels: [1, 1, 1, 2, 2, 2], density: 160 },
      { rec: 16, plot: 15, subPlot: '',  levels: [1, 1, 1, 3, 1, 2], density: 160 },
      { rec: 17, plot: 15, subPlot: 'A', levels: [1, 1, 1, 3, 0, 2], density: 160 },
      { rec: 18, plot: 15, subPlot: 'B', levels: [1, 1, 1, 3, 2, 2], density: 160 },
      { rec: 19, plot: 16, subPlot: '',  levels: [1, 1, 2, 1, 1, 1], density: 160 },
      { rec: 20, plot: 17, subPlot: '',  levels: [1, 1, 2, 2, 1, 1], density: 160 },
      { rec: 21, plot: 18, subPlot: '',  levels: [1, 1, 2, 3, 1, 1], density: 160 },
      { rec: 22, plot: 19, subPlot: '',  levels: [1, 2, 0, 0, 1, 1], density: 120 },
      { rec: 23, plot: 20, subPlot: '',  levels: [1, 2, 0, 2, 1, 1], density: 120 },
      { rec: 24, plot: 21, subPlot: '',  levels: [1, 2, 0, 3, 1, 1], density: 120 },
      { rec: 25, plot: 22, subPlot: '',  levels: [1, 2, 1, 1, 1, 1], density: 120 },
      { rec: 26, plot: 23, subPlot: '',  levels: [1, 2, 1, 2, 1, 1], density: 120 },
      { rec: 27, plot: 24, subPlot: '',  levels: [1, 2, 1, 3, 1, 1], density: 120 },
      { rec: 28, plot: 25, subPlot: '',  levels: [1, 2, 2, 1, 1, 1], density: 120 },
      { rec: 29, plot: 26, subPlot: '',  levels: [1, 2, 2, 2, 1, 1], density: 120 }
    ],
    palms: [
      { rec: 1,  plot: 1, subPlot: '', palmNo: '739', progeny: 'D x P AVROS', status: 'Healthy' },
      { rec: 2,  plot: 1, subPlot: '', palmNo: '740', progeny: 'D x P AVROS', status: 'Healthy' },
      { rec: 3,  plot: 1, subPlot: '', palmNo: '779', progeny: 'D x P AVROS', status: 'Healthy' },
      { rec: 4,  plot: 1, subPlot: '', palmNo: '780', progeny: 'D x P AVROS', status: 'Healthy' },
      { rec: 5,  plot: 1, subPlot: '', palmNo: '818', progeny: 'D x P AVROS', status: 'Healthy' },
      { rec: 6,  plot: 1, subPlot: '', palmNo: '819', progeny: 'D x P AVROS', status: 'Healthy' },
      { rec: 7,  plot: 1, subPlot: '', palmNo: '858', progeny: 'D x P AVROS', status: 'Healthy' },
      { rec: 8,  plot: 1, subPlot: '', palmNo: '859', progeny: 'D x P AVROS', status: 'Healthy' },
      { rec: 9,  plot: 2, subPlot: '', palmNo: '207', progeny: 'D x P MARDI', status: 'Healthy' },
      { rec: 10, plot: 2, subPlot: '', palmNo: '208', progeny: 'D x P MARDI', status: 'Healthy' },
      { rec: 11, plot: 2, subPlot: '', palmNo: '247', progeny: 'D x P MARDI', status: 'Healthy' },
      { rec: 12, plot: 2, subPlot: '', palmNo: '248', progeny: 'D x P MARDI', status: 'Healthy' },
      { rec: 13, plot: 2, subPlot: '', palmNo: '288', progeny: 'D x P MARDI', status: 'Healthy' },
      { rec: 14, plot: 2, subPlot: '', palmNo: '289', progeny: 'D x P MARDI', status: 'Healthy' },
      { rec: 15, plot: 2, subPlot: '', palmNo: '328', progeny: 'D x P MARDI', status: 'Healthy' },
      { rec: 16, plot: 2, subPlot: '', palmNo: '329', progeny: 'D x P MARDI', status: 'Healthy' },
      { rec: 17, plot: 3, subPlot: '', palmNo: '56',  progeny: 'D x P Yangambi', status: 'Healthy' },
      { rec: 18, plot: 3, subPlot: '', palmNo: '57',  progeny: 'D x P Yangambi', status: 'Healthy' },
      { rec: 19, plot: 3, subPlot: '', palmNo: '95',  progeny: 'D x P Yangambi', status: 'Healthy' },
      { rec: 20, plot: 3, subPlot: '', palmNo: '96',  progeny: 'D x P Yangambi', status: 'Healthy' },
      { rec: 21, plot: 3, subPlot: '', palmNo: '134', progeny: 'D x P Yangambi', status: 'Healthy' },
      { rec: 22, plot: 3, subPlot: '', palmNo: '135', progeny: 'D x P Yangambi', status: 'Healthy' },
      { rec: 23, plot: 3, subPlot: '', palmNo: '173', progeny: 'D x P Yangambi', status: 'Healthy' },
      { rec: 24, plot: 3, subPlot: '', palmNo: '174', progeny: 'D x P Yangambi', status: 'Healthy' }
    ],
    harvestRecords: [
      { rec: 1,  plot: 1, subPlot: '', palmNo: '18',  round: 1, date: '15/03/1997', nob: 2, bunchWt: 34.6, looseFruit: 2.8, harvesterId: 'H01', remarks: 'Normal Harvest' },
      { rec: 2,  plot: 1, subPlot: '', palmNo: '19',  round: 1, date: '15/03/1997', nob: 1, bunchWt: 19.2, looseFruit: 1.4, harvesterId: 'H01', remarks: 'Normal Harvest' },
      { rec: 3,  plot: 1, subPlot: '', palmNo: '57',  round: 1, date: '15/03/1997', nob: 3, bunchWt: 48.0, looseFruit: 3.5, harvesterId: 'H02', remarks: 'Normal Harvest' },
      { rec: 4,  plot: 1, subPlot: '', palmNo: '58',  round: 1, date: '15/03/1997', nob: 2, bunchWt: 31.8, looseFruit: 2.1, harvesterId: 'H02', remarks: 'Normal Harvest' },
      { rec: 5,  plot: 2, subPlot: '', palmNo: '19',  round: 1, date: '16/03/1997', nob: 2, bunchWt: 36.4, looseFruit: 3.0, harvesterId: 'H01', remarks: 'Normal Harvest' },
      { rec: 6,  plot: 2, subPlot: '', palmNo: '20',  round: 1, date: '16/03/1997', nob: 1, bunchWt: 17.5, looseFruit: 1.8, harvesterId: 'H01', remarks: 'Normal Harvest' },
      { rec: 7,  plot: 1, subPlot: '', palmNo: '18',  round: 2, date: '30/03/1997', nob: 1, bunchWt: 18.4, looseFruit: 1.5, harvesterId: 'H03', remarks: 'Normal Harvest' },
      { rec: 8,  plot: 1, subPlot: '', palmNo: '19',  round: 2, date: '30/03/1997', nob: 2, bunchWt: 35.0, looseFruit: 2.6, harvesterId: 'H03', remarks: 'Normal Harvest' },
      { rec: 9,  plot: 1, subPlot: '', palmNo: '57',  round: 2, date: '30/03/1997', nob: 2, bunchWt: 33.2, looseFruit: 2.0, harvesterId: 'H02', remarks: 'Normal Harvest' },
      { rec: 10, plot: 1, subPlot: '', palmNo: '58',  round: 2, date: '30/03/1997', nob: 1, bunchWt: 16.9, looseFruit: 1.2, harvesterId: 'H02', remarks: 'Normal Harvest' },
      { rec: 11, plot: 2, subPlot: '', palmNo: '19',  round: 2, date: '31/03/1997', nob: 3, bunchWt: 51.2, looseFruit: 3.8, harvesterId: 'H01', remarks: 'Normal Harvest' },
      { rec: 12, plot: 2, subPlot: '', palmNo: '20',  round: 2, date: '31/03/1997', nob: 2, bunchWt: 32.5, looseFruit: 2.4, harvesterId: 'H01', remarks: 'Normal Harvest' }
    ],
    missingPalms: [
      { rec: 1, plot: 1, subPlot: '', palmNo: '59', censusDate: '10/01/1997', status: 'Dead - Lightning', replaced: 'No' },
      { rec: 2, plot: 2, subPlot: '', palmNo: '60', censusDate: '10/01/1997', status: 'Non-bearing / Sterile', replaced: 'No' }
    ],
    vegetativeRecords: [
      { rec: 1, plot: 1, subPlot: '', palmNo: '18', frond: 17, rachisLen: 545.0, petioleW: 5.2, petioleD: 3.8, pinnaeCount: 310, leafletLen: 85.0, leafletW: 4.8, trunkHt: 3.45 },
      { rec: 2, plot: 1, subPlot: '', palmNo: '19', frond: 17, rachisLen: 520.0, petioleW: 4.9, petioleD: 3.6, pinnaeCount: 298, leafletLen: 82.0, leafletW: 4.6, trunkHt: 3.20 },
      { rec: 3, plot: 1, subPlot: '', palmNo: '57', frond: 17, rachisLen: 550.0, petioleW: 5.3, petioleD: 3.9, pinnaeCount: 315, leafletLen: 86.0, leafletW: 4.9, trunkHt: 3.60 },
      { rec: 4, plot: 1, subPlot: '', palmNo: '58', frond: 17, rachisLen: 535.0, petioleW: 5.0, petioleD: 3.7, pinnaeCount: 305, leafletLen: 84.0, leafletW: 4.7, trunkHt: 3.35 },
      { rec: 5, plot: 2, subPlot: '', palmNo: '19', frond: 17, rachisLen: 560.0, petioleW: 5.4, petioleD: 4.0, pinnaeCount: 320, leafletLen: 88.0, leafletW: 5.0, trunkHt: 3.80 },
      { rec: 6, plot: 2, subPlot: '', palmNo: '20', frond: 17, rachisLen: 540.0, petioleW: 5.1, petioleD: 3.7, pinnaeCount: 308, leafletLen: 83.0, leafletW: 4.7, trunkHt: 3.50 }
    ],
    annualPlotData: {
      ffb: [
        { rec: 1, plot: 1, palms: 16, bwt: 18.5, nob: 15.2, palmYield: 281.2, ffbYield: 45.0, bwtTotal: 4499, bnoTotal: 243 },
        { rec: 2, plot: 2, palms: 16, bwt: 17.8, nob: 14.6, palmYield: 259.9, ffbYield: 41.6, bwtTotal: 4158, bnoTotal: 234 },
        { rec: 3, plot: 3, palms: 16, bwt: 19.2, nob: 16.0, palmYield: 307.2, ffbYield: 49.2, bwtTotal: 4915, bnoTotal: 256 },
        { rec: 4, plot: 4, palms: 16, bwt: 16.9, nob: 13.8, palmYield: 233.2, ffbYield: 37.3, bwtTotal: 3731, bnoTotal: 221 },
        { rec: 5, plot: 5, palms: 16, bwt: 18.1, nob: 14.9, palmYield: 269.7, ffbYield: 43.2, bwtTotal: 4315, bnoTotal: 238 },
        { rec: 6, plot: 6, palms: 16, bwt: 20.4, nob: 16.5, palmYield: 336.6, ffbYield: 53.9, bwtTotal: 5386, bnoTotal: 264 }
      ],
      leaf: [
        { rec: 1, plot: 1, sampleType: 'Frond 17', n: 2.78, p: 0.168, k: 1.18, ca: 0.54, mg: 0.36, s: 0.19, cl: 0.58, b: 17.2, cu: 5.1, zn: 16.4, mn: 120, fe: 82 },
        { rec: 2, plot: 2, sampleType: 'Frond 17', n: 2.65, p: 0.162, k: 1.08, ca: 0.51, mg: 0.32, s: 0.18, cl: 0.52, b: 15.8, cu: 4.8, zn: 15.1, mn: 110, fe: 76 },
        { rec: 3, plot: 3, sampleType: 'Frond 17', n: 2.84, p: 0.174, k: 1.26, ca: 0.58, mg: 0.39, s: 0.21, cl: 0.62, b: 18.5, cu: 5.4, zn: 17.2, mn: 135, fe: 88 },
        { rec: 4, plot: 4, sampleType: 'Frond 17', n: 2.58, p: 0.155, k: 0.98, ca: 0.48, mg: 0.29, s: 0.17, cl: 0.48, b: 14.5, cu: 4.5, zn: 14.0, mn: 98,  fe: 70 },
        { rec: 5, plot: 5, sampleType: 'Frond 17', n: 2.72, p: 0.165, k: 1.15, ca: 0.53, mg: 0.35, s: 0.19, cl: 0.56, b: 16.8, cu: 5.0, zn: 15.9, mn: 118, fe: 80 },
        { rec: 6, plot: 6, sampleType: 'Frond 17', n: 2.91, p: 0.178, k: 1.32, ca: 0.61, mg: 0.42, s: 0.22, cl: 0.65, b: 19.8, cu: 5.8, zn: 18.0, mn: 142, fe: 92 }
      ],
      veg: [
        { rec: 1, plot: 1, frond: 17, rachisLen: 545.0, petioleW: 5.2, petioleD: 3.8, petioleArea: 19.76, pinnae: 310, leafArea: 9.16, fdw: 0.97, lai: 5.42, trunkHt: 3.45 },
        { rec: 2, plot: 2, frond: 17, rachisLen: 520.0, petioleW: 4.9, petioleD: 3.6, petioleArea: 17.64, pinnae: 298, leafArea: 8.65, fdw: 0.89, lai: 5.12, trunkHt: 3.20 },
        { rec: 3, plot: 3, frond: 17, rachisLen: 560.0, petioleW: 5.4, petioleD: 4.0, petioleArea: 21.60, pinnae: 320, leafArea: 9.68, fdw: 1.04, lai: 5.73, trunkHt: 3.80 },
        { rec: 4, plot: 4, frond: 17, rachisLen: 535.0, petioleW: 5.0, petioleD: 3.7, petioleArea: 18.50, pinnae: 305, leafArea: 8.92, fdw: 0.92, lai: 5.28, trunkHt: 3.35 },
        { rec: 5, plot: 5, frond: 17, rachisLen: 550.0, petioleW: 5.3, petioleD: 3.9, petioleArea: 20.67, pinnae: 315, leafArea: 9.40, fdw: 1.00, lai: 5.56, trunkHt: 3.60 },
        { rec: 6, plot: 6, frond: 17, rachisLen: 570.0, petioleW: 5.6, petioleD: 4.1, petioleArea: 22.96, pinnae: 325, leafArea: 10.05, fdw: 1.09, lai: 5.95, trunkHt: 4.05 }
      ],
      soil: [
        { rec: 1, plot: 1, depth: '0-15 cm', ph: 4.35, orgC: 1.48, totalN: 0.14, extrP: 18.5, exchK: 0.28, exchCa: 1.95, exchMg: 0.45, cec: 8.6 },
        { rec: 2, plot: 2, depth: '0-15 cm', ph: 4.28, orgC: 1.39, totalN: 0.12, extrP: 16.2, exchK: 0.24, exchCa: 1.72, exchMg: 0.38, cec: 7.9 },
        { rec: 3, plot: 3, depth: '0-15 cm', ph: 4.45, orgC: 1.56, totalN: 0.15, extrP: 21.0, exchK: 0.32, exchCa: 2.15, exchMg: 0.52, cec: 9.4 },
        { rec: 4, plot: 4, depth: '0-15 cm', ph: 4.15, orgC: 1.30, totalN: 0.11, extrP: 14.8, exchK: 0.21, exchCa: 1.55, exchMg: 0.32, cec: 7.4 },
        { rec: 5, plot: 5, depth: '0-15 cm', ph: 4.38, orgC: 1.44, totalN: 0.13, extrP: 17.9, exchK: 0.27, exchCa: 1.88, exchMg: 0.43, cec: 8.4 },
        { rec: 6, plot: 6, depth: '0-15 cm', ph: 4.52, orgC: 1.62, totalN: 0.16, extrP: 23.5, exchK: 0.35, exchCa: 2.30, exchMg: 0.58, cec: 10.1 }
      ]
    }
  },
  {
    code: 'FT1',
    estate: 'Sg. Papan',
    plantingYear: 1989,
    factorsCount: 4,
    factors: [
      { id: 1, label: 'Rep', name: 'Replicate' },
      { id: 2, label: 'N',   name: 'Nitrogen' },
      { id: 3, label: 'P',   name: 'Phosphorus' },
      { id: 4, label: 'K',   name: 'Potassium' }
    ],
    factorInfo: 'Rep = Replicate\nN = Nitrogen\nP = Phosphorus\nK = Potassium',
    densityType: 'constant',
    constantDensity: 148,
    plotTreatments: [
      { rec: 1, plot: 1, subPlot: '', levels: [1, 0, 0, 0], density: 148 },
      { rec: 2, plot: 2, subPlot: '', levels: [1, 1, 0, 0], density: 148 },
      { rec: 3, plot: 3, subPlot: '', levels: [1, 2, 1, 1], density: 148 },
      { rec: 4, plot: 4, subPlot: '', levels: [1, 3, 2, 2], density: 148 }
    ],
    palms: [
      { rec: 1, plot: 1, subPlot: '', palmNo: '101', progeny: 'D x P Chemara', status: 'Healthy' },
      { rec: 2, plot: 1, subPlot: '', palmNo: '102', progeny: 'D x P Chemara', status: 'Healthy' }
    ]
  },
  {
    code: 'FT2',
    estate: 'Bkt. Paloh',
    plantingYear: 1990,
    factorsCount: 4,
    factors: [
      { id: 1, label: 'Rep', name: 'Replicate' },
      { id: 2, label: 'N',   name: 'Nitrogen' },
      { id: 3, label: 'K',   name: 'Potassium' },
      { id: 4, label: 'Mg',  name: 'Magnesium' }
    ],
    factorInfo: 'Rep = Replicate\nN = Nitrogen\nK = Potassium\nMg = Magnesium',
    densityType: 'constant',
    constantDensity: 136,
    plotTreatments: [
      { rec: 1, plot: 1, subPlot: '', levels: [1, 1, 1, 1], density: 136 },
      { rec: 2, plot: 2, subPlot: '', levels: [1, 2, 2, 1], density: 136 }
    ],
    palms: []
  },
  {
    code: 'FT3',
    estate: 'Pamol, Sabah',
    plantingYear: 1991,
    factorsCount: 5,
    factors: [
      { id: 1, label: 'Rep', name: 'Replicate' },
      { id: 2, label: 'N',   name: 'Nitrogen' },
      { id: 3, label: 'P',   name: 'Phosphorus' },
      { id: 4, label: 'K',   name: 'Potassium' },
      { id: 5, label: 'B',   name: 'Boron' }
    ],
    factorInfo: 'Rep = Replicate\nN = Nitrogen\nP = Phosphorus\nK = Potassium\nB = Boron',
    densityType: 'constant',
    constantDensity: 142,
    plotTreatments: [],
    palms: []
  },
  { code: 'FT4',   estate: 'Malamba, Sabah', plantingYear: 1992, factorsCount: 4, factors: [], factorInfo: '', densityType: 'constant', constantDensity: 148, plotTreatments: [], palms: [] },
  { code: 'FT5',   estate: 'Ldg. Koko, Land', truncated: true, plantingYear: 1993, factorsCount: 4, factors: [], factorInfo: '', densityType: 'constant', constantDensity: 148, plotTreatments: [], palms: [] },
  { code: 'LPK1',  estate: 'Teluk Intan', plantingYear: 1989, factorsCount: 5, factors: [], factorInfo: '', densityType: 'constant', constantDensity: 160, plotTreatments: [], palms: [] },
  { code: 'RISDA', estate: 'Gerdong', plantingYear: 1987, factorsCount: 4, factors: [], factorInfo: '', densityType: 'constant', constantDensity: 148, plotTreatments: [], palms: [] },
  { code: 'TEP1',  estate: 'Teluk Intan', plantingYear: 1989, factorsCount: 4, factors: [], factorInfo: '', densityType: 'constant', constantDensity: 148, plotTreatments: [], palms: [] },
  { code: 'TEP2',  estate: 'Felcra Sg. Mong', truncated: true, plantingYear: 1990, factorsCount: 4, factors: [], factorInfo: '', densityType: 'constant', constantDensity: 148, plotTreatments: [], palms: [] }
];

/**
 * Sample external non-ReaDA DBase file structure for Lesson 2 (2.9 and 2.14)
 * Simulating "B:DTPL1195.DBF" from Figure 10
 */
window.READA_EXTERNAL_DBF = {
  fileName: 'B:\\DTPL1195.DBF',
  description: 'External Agronomy dBase III+ Plot Trial Export (Sabah/Perak)',
  fields: ['REC_NO', 'PLOT_ID', 'BLOCK', 'REP_CODE', 'DENS_LVL', 'N_LVL', 'P_LVL', 'K_LVL', 'L_LVL', 'SPACING'],
  defaultMapping: {
    PLOT: 'PLOT_ID',
    SUBPLOT: 'BLOCK',
    REP: 'REP_CODE',
    D: 'DENS_LVL',
    N: 'N_LVL',
    P: 'P_LVL',
    K: 'K_LVL',
    L: 'L_LVL',
    DENSITY: 'SPACING'
  },
  sampleRows: [
    { REC_NO: 1,  PLOT_ID: 1,  BLOCK: '',  REP_CODE: 1, DENS_LVL: 1, N_LVL: 0, P_LVL: 0, K_LVL: 1, L_LVL: 1, SPACING: 160 },
    { REC_NO: 2,  PLOT_ID: 2,  BLOCK: '',  REP_CODE: 1, DENS_LVL: 1, N_LVL: 0, P_LVL: 1, K_LVL: 1, L_LVL: 1, SPACING: 160 },
    { REC_NO: 3,  PLOT_ID: 3,  BLOCK: '',  REP_CODE: 1, DENS_LVL: 1, N_LVL: 0, P_LVL: 2, K_LVL: 1, L_LVL: 1, SPACING: 160 },
    { REC_NO: 4,  PLOT_ID: 4,  BLOCK: '',  REP_CODE: 1, DENS_LVL: 1, N_LVL: 0, P_LVL: 3, K_LVL: 1, L_LVL: 1, SPACING: 160 },
    { REC_NO: 5,  PLOT_ID: 5,  BLOCK: 'A', REP_CODE: 1, DENS_LVL: 1, N_LVL: 1, P_LVL: 0, K_LVL: 1, L_LVL: 1, SPACING: 160 },
    { REC_NO: 6,  PLOT_ID: 5,  BLOCK: 'B', REP_CODE: 1, DENS_LVL: 1, N_LVL: 1, P_LVL: 1, K_LVL: 1, L_LVL: 1, SPACING: 160 },
    { REC_NO: 7,  PLOT_ID: 6,  BLOCK: '',  REP_CODE: 1, DENS_LVL: 2, N_LVL: 1, P_LVL: 2, K_LVL: 1, L_LVL: 1, SPACING: 120 },
    { REC_NO: 8,  PLOT_ID: 7,  BLOCK: '',  REP_CODE: 1, DENS_LVL: 2, N_LVL: 1, P_LVL: 3, K_LVL: 1, L_LVL: 1, SPACING: 120 },
    { REC_NO: 9,  PLOT_ID: 8,  BLOCK: '',  REP_CODE: 1, DENS_LVL: 2, N_LVL: 2, P_LVL: 1, K_LVL: 1, L_LVL: 1, SPACING: 120 },
    { REC_NO: 10, PLOT_ID: 9,  BLOCK: '',  REP_CODE: 1, DENS_LVL: 2, N_LVL: 2, P_LVL: 2, K_LVL: 1, L_LVL: 1, SPACING: 120 }
  ]
};

/**
 * Sample external non-ReaDA Harvesting Yield CSV file structure
 * Simulating digital field weigh scales and harvester logger uploads
 */
window.READA_EXTERNAL_YIELD_CSV = {
  fileName: 'B:\\YLD97.CSV',
  description: 'External Agronomy Field Scale Logger Export (Bi-Weekly FFB Harvest)',
  fields: ['PLOT', 'PALM', 'RND', 'HARV_DATE', 'NO_BUNCH', 'BWT_KG', 'LOOSE_KG', 'HARV_CODE', 'REMARK'],
  defaultMapping: {
    PLOT_NO: 'PLOT',
    PALM_NO: 'PALM',
    ROUND_NO: 'RND',
    HARVEST_DATE: 'HARV_DATE',
    NOB: 'NO_BUNCH',
    BUNCH_WT: 'BWT_KG',
    LOOSE_FRUIT: 'LOOSE_KG',
    HARVESTER_ID: 'HARV_CODE',
    REMARKS: 'REMARK'
  },
  sampleRows: [
    { PLOT: 1, PALM: '18',  RND: 3, HARV_DATE: '14/04/1997', NO_BUNCH: 2, BWT_KG: 35.8, LOOSE_KG: 2.5, HARV_CODE: 'H01', REMARK: 'Ripe bunch' },
    { PLOT: 1, PALM: '19',  RND: 3, HARV_DATE: '14/04/1997', NO_BUNCH: 1, BWT_KG: 19.4, LOOSE_KG: 1.2, HARV_CODE: 'H01', REMARK: 'Normal' },
    { PLOT: 1, PALM: '57',  RND: 3, HARV_DATE: '14/04/1997', NO_BUNCH: 3, BWT_KG: 49.1, LOOSE_KG: 3.1, HARV_CODE: 'H02', REMARK: 'Overripe bunch' },
    { PLOT: 1, PALM: '58',  RND: 3, HARV_DATE: '14/04/1997', NO_BUNCH: 2, BWT_KG: 32.0, LOOSE_KG: 2.0, HARV_CODE: 'H02', REMARK: 'Normal' },
    { PLOT: 2, PALM: '19',  RND: 3, HARV_DATE: '15/04/1997', NO_BUNCH: 2, BWT_KG: 38.0, LOOSE_KG: 2.9, HARV_CODE: 'H03', REMARK: 'Normal' },
    { PLOT: 2, PALM: '20',  RND: 3, HARV_DATE: '15/04/1997', NO_BUNCH: 1, BWT_KG: 18.2, LOOSE_KG: 1.5, HARV_CODE: 'H03', REMARK: 'Under-ripe' }
  ]
};

/**
 * Sample external non-ReaDA Vegetative Measurement CSV file structure
 * Simulating electronic forestry caliper and hypsometer logger uploads (B:\VEG93.CSV)
 */
window.READA_EXTERNAL_VEG_CSV = {
  fileName: 'B:\\VEG93.CSV',
  description: 'External Agronomy Digital Caliper & Hypsometer Export (Frond 17 Sampling)',
  fields: ['PLOT', 'PALM', 'FROND', 'RACHIS_CM', 'PET_W_CM', 'PET_D_CM', 'PINNAE', 'LLEN_CM', 'LWID_CM', 'TRUNK_M'],
  defaultMapping: {
    PLOT_NO: 'PLOT',
    PALM_NO: 'PALM',
    FROND_NO: 'FROND',
    RACHIS_LEN: 'RACHIS_CM',
    PETIOLE_W: 'PET_W_CM',
    PETIOLE_D: 'PET_D_CM',
    PINNAE_CNT: 'PINNAE',
    LEAFLET_LEN: 'LLEN_CM',
    LEAFLET_W: 'LWID_CM',
    TRUNK_HT: 'TRUNK_M'
  },
  sampleRows: [
    { PLOT: 1, PALM: '18',  FROND: 17, RACHIS_CM: 552.0, PET_W_CM: 5.3, PET_D_CM: 3.9, PINNAE: 312, LLEN_CM: 86.5, LWID_CM: 4.9, TRUNK_M: 3.85 },
    { PLOT: 1, PALM: '19',  FROND: 17, RACHIS_CM: 528.0, PET_W_CM: 5.0, PET_D_CM: 3.7, PINNAE: 300, LLEN_CM: 83.0, LWID_CM: 4.7, TRUNK_M: 3.55 },
    { PLOT: 1, PALM: '57',  FROND: 17, RACHIS_CM: 558.0, PET_W_CM: 5.4, PET_D_CM: 4.0, PINNAE: 318, LLEN_CM: 87.2, LWID_CM: 5.0, TRUNK_M: 3.95 },
    { PLOT: 1, PALM: '58',  FROND: 17, RACHIS_CM: 542.0, PET_W_CM: 5.1, PET_D_CM: 3.8, PINNAE: 309, LLEN_CM: 85.0, LWID_CM: 4.8, TRUNK_M: 3.70 },
    { PLOT: 2, PALM: '19',  FROND: 17, RACHIS_CM: 566.0, PET_W_CM: 5.5, PET_D_CM: 4.1, PINNAE: 324, LLEN_CM: 89.0, LWID_CM: 5.1, TRUNK_M: 4.15 },
    { PLOT: 2, PALM: '20',  FROND: 17, RACHIS_CM: 546.0, PET_W_CM: 5.2, PET_D_CM: 3.8, PINNAE: 310, LLEN_CM: 84.5, LWID_CM: 4.8, TRUNK_M: 3.85 }
  ]
};

/**
 * Sample external non-ReaDA Annual Plot Data dBase file structure
 * Simulating "B:\ANNDAT95.DBF" / CSV export
 */
window.READA_EXTERNAL_ANNUAL_DBF = {
  fileName: 'B:\\ANNDAT95.DBF',
  description: 'External Agronomy Annual Plot Data Export (Multi-Disciplinary Summary)',
  fields: ['PLOT', 'FFB_THA', 'N_PCT', 'P_PCT', 'K_PCT', 'LAI', 'PH_H2O', 'CEC'],
  sampleRows: [
    { PLOT: 1, FFB_THA: 46.2, N_PCT: 2.80, P_PCT: 0.170, K_PCT: 1.20, LAI: 5.50, PH_H2O: 4.40, CEC: 8.8 },
    { PLOT: 2, FFB_THA: 42.5, N_PCT: 2.68, P_PCT: 0.164, K_PCT: 1.10, LAI: 5.18, PH_H2O: 4.30, CEC: 8.1 },
    { PLOT: 3, FFB_THA: 50.1, N_PCT: 2.88, P_PCT: 0.176, K_PCT: 1.28, LAI: 5.80, PH_H2O: 4.48, CEC: 9.6 },
    { PLOT: 4, FFB_THA: 38.0, N_PCT: 2.60, P_PCT: 0.158, K_PCT: 1.00, LAI: 5.30, PH_H2O: 4.18, CEC: 7.6 },
    { PLOT: 5, FFB_THA: 44.1, N_PCT: 2.75, P_PCT: 0.167, K_PCT: 1.17, LAI: 5.60, PH_H2O: 4.40, CEC: 8.5 },
    { PLOT: 6, FFB_THA: 54.8, N_PCT: 2.95, P_PCT: 0.180, K_PCT: 1.35, LAI: 6.02, PH_H2O: 4.55, CEC: 10.3 }
  ]
};

