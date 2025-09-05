// ConfigurableMRTPage.jsx
// Fully responsive, config‑driven Material React Table (MRT) page with a detached filter panel,
// switchable data source (mock vs API), dynamic i18n labels, and export options (CSV/Excel/PDF + custom formats).
//
// ✅ Features
// - Data source: mock JSON or API (switch via config)
// - Detached, config-driven filters (select/text/date presets & custom range)
// - MRT built-in sorting; our own filters (not MRT default filters)
// - Exports: CSV, Excel (ExcelJS), PDF (jsPDF/autoTable) with style config,
//            plus custom exports (QuickBooks JSON, FMCSA PDF)
// - Back button navigation
// - i18n-first labels using react-i18next keys
// - Responsive: desktop/tablet/mobile (filter drawer on small screens)
// - Reusable: single component with a rich config object
//
// 📦 Required packages (install before use):
//   npm i react react-dom react-router-dom material-react-table @mui/material @mui/icons-material @emotion/react @emotion/styled
//   npm i dayjs file-saver exceljs jspdf jspdf-autotable
//   npm i react-i18next i18next
//   // (Optional) If your project already has MUI/i18n, skip duplicates.
//
// 🧩 Usage Example (see bottom: defaultConfig & mock data). You can import and render:
//   <ConfigurableMRTPage config={defaultConfig} />
//
// Notes:
// - This file assumes your i18n provider is mounted above (I18nextProvider / useTranslation ready).
// - If you don't use react-router, the Back button falls back to window.history.back().

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Stack,
  Button,
  IconButton,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Chip,
  Divider,
  useMediaQuery,
  Drawer,
  Toolbar,
  AppBar,
  Menu,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import TableViewOutlinedIcon from "@mui/icons-material/TableViewOutlined";
import GridOnOutlinedIcon from "@mui/icons-material/GridOnOutlined";
import DataObjectOutlinedIcon from "@mui/icons-material/DataObjectOutlined";
import { useNavigate } from "react-router-dom";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import dayjs from "dayjs";
import { saveAs } from "file-saver";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useTranslation } from "react-i18next";

// ------------------------- Helper: i18n safe t -------------------------
const useT = () => {
  const { t } = useTranslation();
  return (key, fallback, options = {}) =>
    t(key, fallback ? { defaultValue: fallback, ...options } : options);
};

// ------------------------- Date helpers -------------------------
const startOfToday = () => dayjs().startOf("day");
const startOfQuarter = () => {
  const month = dayjs().month();
  const qStartMonth = month - (month % 3);
  return dayjs().month(qStartMonth).startOf("month");
};

const getPresetDateRange = (preset) => {
  // preset examples: { type: 'lastNDays', n: 7 } | { type: 'lastNDays', n: 30 } | { type: 'quarterToDate' } | { type: 'lastNYears', n: 5 }
  const today = startOfToday();
  switch (preset?.type) {
    case "lastNDays":
      return {
        start: today.subtract((preset.n || 7) - 1, "day"),
        end: today.endOf("day"),
      };
    case "quarterToDate":
      return { start: startOfQuarter(), end: today.endOf("day") };
    case "lastNYears":
      return {
        start: today.subtract(preset.n || 1, "year").startOf("day"),
        end: today.endOf("day"),
      };
    default:
      return { start: null, end: null };
  }
};

// ------------------------- CSV export helper -------------------------
const toCSV = (rows, columns) => {
  const headers = columns.map((c) => c.header);
  const lines = rows.map((r) =>
    columns
      .map((c) => {
        const v = r[c.accessorKey];
        const cell = v == null ? "" : String(v).replaceAll('"', '""');
        return `"${cell}"`;
      })
      .join(",")
  );
  return [headers.join(","), ...lines].join("\n");
};

// ------------------------- Excel export helper -------------------------
const exportExcel = async (
  rows,
  columns,
  fileName = "export.xlsx",
  styleCfg = {}
) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  // Header row
  ws.addRow(columns.map((c) => c.header));
  // Body rows
  rows.forEach((r) => ws.addRow(columns.map((c) => r[c.accessorKey])));
  // Simple styling (configurable)
  const headerStyle = styleCfg.header || { bold: true };
  ws.getRow(1).font = headerStyle;
  // Column widths
  columns.forEach((c, i) => {
    const maxLen = Math.max(
      c.header?.length || 10,
      ...rows.map((r) => String(r[c.accessorKey] ?? "").length)
    );
    ws.getColumn(i + 1).width = Math.min(Math.max(10, maxLen + 2), 50);
  });
  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName
  );
};

// ------------------------- PDF export helper -------------------------
const exportPDF = (rows, columns, fileName = "export.pdf", styleCfg = {}) => {
  const doc = new jsPDF({
    orientation: styleCfg.orientation || "landscape",
    unit: "pt",
    format: "a4",
  });

  const head = [columns.map((c) => c.header)];
  const body = rows.map((r) => columns.map((c) => r[c.accessorKey]));

  const title = styleCfg.title || "Report";
  doc.setFontSize(styleCfg.titleFontSize || 14);
  doc.text(title, 40, 40);

  autoTable(doc, {
    startY: 60,
    head,
    body,
    styles: styleCfg.tableStyles || { fontSize: 8 },
    headStyles: styleCfg.headStyles || { fillColor: [240, 240, 240] },
    bodyStyles: styleCfg.bodyStyles || {},
    margin: { left: 40, right: 40 },
  });

  doc.save(fileName);
};

// ------------------------- Custom export helpers -------------------------
const exportQuickBooksJSON = (rows, mapping, fileName = "quickbooks.json") => {
  // mapping example: { name: 'DisplayName', status: 'Active', createdAt: 'Meta.CreateTime' }
  const mapped = rows.map((r) => {
    const out = {};
    Object.entries(mapping || {}).forEach(([field, qbField]) => {
      // support nested writing like 'Meta.CreateTime'
      const path = qbField.split(".");
      let cursor = out;
      path.forEach((seg, idx) => {
        if (idx === path.length - 1) {
          cursor[seg] = r[field];
        } else {
          cursor[seg] = cursor[seg] || {};
          cursor = cursor[seg];
        }
      });
    });
    return out;
  });
  const blob = new Blob([JSON.stringify(mapped, null, 2)], {
    type: "application/json",
  });
  saveAs(blob, fileName);
};

const exportFMCSAPDF = (
  rows,
  columns,
  styleCfg = {},
  fileName = "fmcsa.pdf"
) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  doc.setFontSize(styleCfg.titleFontSize || 16);
  doc.text(styleCfg.title || "FMCSA Compliance Report", 40, 40);
  doc.setFontSize(10);
  doc.text(
    `Generated: ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    40,
    60
  );

  const head = [columns.map((c) => c.header)];
  const body = rows.map((r) => columns.map((c) => r[c.accessorKey]));

  autoTable(doc, {
    startY: 80,
    head,
    body,
    styles: styleCfg.tableStyles || { fontSize: 8 },
    headStyles: styleCfg.headStyles || { fillColor: [230, 230, 230] },
    margin: { left: 40, right: 40 },
  });

  doc.save(fileName);
};

// ------------------------- Filter logic -------------------------
const applyClientFilters = (data, filtersCfg, filtersState) => {
  if (!Array.isArray(data)) return [];
  const active = filtersCfg || [];
  return data.filter((row) => {
    return active.every((f) => {
      const field = f.field;
      const value = row[field];
      const fs = filtersState[field];

      if (f.type === "select") {
        if (!fs || fs.length === 0) return true; // no selection → pass
        // support multi or single
        const selected = Array.isArray(fs) ? fs : [fs];
        return selected.includes(value);
      }

      if (f.type === "text") {
        const q = (fs || "").trim().toLowerCase();
        if (!q) return true;
        const hay = (value || "").toString().toLowerCase();
        return hay.includes(q);
      }

      if (f.type === "date") {
        // fs can be { preset: {...}, start: dateStr, end: dateStr }
        let start = fs?.start ? dayjs(fs.start).startOf("day") : null;
        let end = fs?.end ? dayjs(fs.end).endOf("day") : null;
        if (fs?.preset) {
          const range = getPresetDateRange(fs.preset);
          start = range.start || start;
          end = range.end || end;
        }
        if (!start && !end) return true;
        const dt = dayjs(value);
        if (!dt.isValid()) return false;
        if (start && dt.isBefore(start)) return false;
        if (end && dt.isAfter(end)) return false;
        return true;
      }

      return true; // unknown filter types pass
    });
  });
};

// ------------------------- Data hook (mock vs API) -------------------------
const useConfigurableData = (
  config,
  filtersState,
  paginationState,
  sortingState
) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setError(null);
    const ds = config?.dataSource || { mode: "mock" };
    try {
      if (ds.mode === "mock") {
        const src = Array.isArray(ds.mockData) ? ds.mockData : [];
        if (
          config?.server?.filtering ||
          config?.server?.sorting ||
          config?.server?.pagination
        ) {
          // You can simulate server logic here if needed; for now return full mock and let client filter/sort
        }
        setData(src);
      } else if (ds.mode === "api") {
        setLoading(true);
        const url = new URL(ds.url, window.location.origin);
        const headers = ds.headers || {};

        // If server-driven, attach filters/sort/pagination
        if (config?.server?.filtering) {
          // naive example: add ?field=value for select/text; date as from/to
          (config.filters || []).forEach((f) => {
            const fs = filtersState[f.field];
            if (!fs) return;
            if (f.type === "select") {
              const v = Array.isArray(fs) ? fs.join(",") : fs;
              if (v) url.searchParams.set(f.field, v);
            } else if (f.type === "text") {
              if (fs) url.searchParams.set(f.field, fs);
            } else if (f.type === "date") {
              let { start, end, preset } = fs;
              if (preset) {
                const r = getPresetDateRange(preset);
                start = r.start?.toISOString();
                end = r.end?.toISOString();
              }
              if (start)
                url.searchParams.set(
                  `${f.field}From`,
                  dayjs(start).toISOString()
                );
              if (end)
                url.searchParams.set(`${f.field}To`, dayjs(end).toISOString());
            }
          });
        }
        if (config?.server?.sorting && sortingState?.[0]) {
          const s = sortingState[0];
          url.searchParams.set("sortBy", s.id);
          url.searchParams.set("sortDir", s.desc ? "desc" : "asc");
        }
        if (config?.server?.pagination && paginationState) {
          url.searchParams.set("page", String(paginationState.pageIndex + 1));
          url.searchParams.set("pageSize", String(paginationState.pageSize));
        }

        const res = await fetch(url.toString(), {
          method: ds.method || "GET",
          headers,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        const rows = ds.transform
          ? ds.transform(payload)
          : payload?.data || payload || [];
        setData(Array.isArray(rows) ? rows : []);
      }
    } catch (e) {
      console.error(e);
      setError(e.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    JSON.stringify(filtersState),
    JSON.stringify(paginationState),
    JSON.stringify(sortingState),
    JSON.stringify(config?.dataSource),
    config?.server?.filtering,
    config?.server?.pagination,
    config?.server?.sorting,
  ]);

  return { data, loading, error, refetch: fetchData };
};

// ------------------------- Filter Panel UI -------------------------
const DetachedFilters = ({
  config,
  filtersState,
  setFiltersState,
  inDrawer,
}) => {
  const t = useT();
  const handleSelect = (field, value) =>
    setFiltersState((s) => ({ ...s, [field]: value }));
  const handleText = (field, value) =>
    setFiltersState((s) => ({ ...s, [field]: value }));
  const handleDatePreset = (field, preset) =>
    setFiltersState((s) => ({
      ...s,
      [field]: { ...(s[field] || {}), preset },
    }));
  const handleDateStart = (field, value) =>
    setFiltersState((s) => ({
      ...s,
      [field]: { ...(s[field] || {}), start: value },
    }));
  const handleDateEnd = (field, value) =>
    setFiltersState((s) => ({
      ...s,
      [field]: { ...(s[field] || {}), end: value },
    }));
  const clearField = (field) =>
    setFiltersState((s) => ({ ...s, [field]: undefined }));

  return (
    <Box
      sx={{
        p: inDrawer ? 2 : 0,
        // pr: inDrawer ? 3 : 0,
        width: inDrawer ? "100%" : "auto",
      }}
    >
      <Stack
        direction={inDrawer ? "column" : "row"}
        spacing={inDrawer ? 2 : 1}
        flexWrap={inDrawer ? "nowrap" : "wrap"}
        alignItems="flex-start"
      >
        {(config.filters || []).map((f) => {
          if (f.type === "select") {
            const value = filtersState[f.field] ?? (f.multiple ? [] : "");
            return (
              <FormControl
                key={f.field}
                size="small"
                fullWidth={inDrawer}
                sx={{ minWidth: inDrawer ? "100%" : 160 }}
              >
                <InputLabel>{t(f.labelKey, f.label || f.field)}</InputLabel>
                <Select
                  label={t(f.labelKey, f.label || f.field)}
                  multiple={!!f.multiple}
                  value={value}
                  onChange={(e) => handleSelect(f.field, e.target.value)}
                >
                  {f.includeEmpty && !f.multiple && (
                    <MenuItem value="">
                      <em>{t(f.emptyLabelKey || "common.all", "All")}</em>
                    </MenuItem>
                  )}
                  {(f.options || []).map((opt) => (
                    <MenuItem key={String(opt.value)} value={opt.value}>
                      {t(opt.labelKey, opt.label || String(opt.value))}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            );
          }

          if (f.type === "text") {
            return (
              <TextField
                key={f.field}
                size="small"
                fullWidth={inDrawer}
                sx={{ minWidth: inDrawer ? "100%" : 220 }}
                label={t(f.labelKey, f.label || f.field)}
                placeholder={t(f.placeholderKey, f.placeholder || "")}
                value={filtersState[f.field] || ""}
                onChange={(e) => handleText(f.field, e.target.value)}
              />
            );
          }

          if (f.type === "date") {
            const fs = filtersState[f.field] || {};
            const presets = f.presets || [
              {
                key: "filters.date.last7Days",
                preset: { type: "lastNDays", n: 7 },
              },
              {
                key: "filters.date.last30Days",
                preset: { type: "lastNDays", n: 30 },
              },
              {
                key: "filters.date.quarterToDate",
                preset: { type: "quarterToDate" },
              },
              {
                key: "filters.date.last5Years",
                preset: { type: "lastNYears", n: 5 },
              },
            ];
            return (
              <Stack
                key={f.field}
                direction={inDrawer ? "column" : "row"}
                spacing={inDrawer ? 2 : 1}
                sx={{
                  width: inDrawer ? "100%" : "auto",
                  flexWrap: inDrawer ? "nowrap" : "wrap",
                }}
              >
                <FormControl
                  size="small"
                  fullWidth={inDrawer}
                  sx={{ minWidth: inDrawer ? "100%" : 180 }}
                >
                  <InputLabel>{t(f.labelKey, f.label || f.field)}</InputLabel>
                  <Select
                    label={t(f.labelKey, f.label || f.field)}
                    value={fs?.preset?.type ? JSON.stringify(fs.preset) : ""}
                    onChange={(e) => {
                      const p = e.target.value
                        ? JSON.parse(e.target.value)
                        : undefined;
                      handleDatePreset(f.field, p);
                    }}
                  >
                    <MenuItem value="">
                      <em>{t("filters.date.custom", "Custom Range")}</em>
                    </MenuItem>
                    {presets.map((p) => (
                      <MenuItem key={p.key} value={JSON.stringify(p.preset)}>
                        {t(p.key)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  type="date"
                  size="small"
                  fullWidth={inDrawer}
                  label={t("filters.date.from", "From")}
                  InputLabelProps={{ shrink: true }}
                  value={fs.start || ""}
                  onChange={(e) => handleDateStart(f.field, e.target.value)}
                />
                <TextField
                  type="date"
                  size="small"
                  fullWidth={inDrawer}
                  label={t("filters.date.to", "To")}
                  InputLabelProps={{ shrink: true }}
                  value={fs.end || ""}
                  onChange={(e) => handleDateEnd(f.field, e.target.value)}
                />
                {(fs.start || fs.end || fs.preset) && (
                  <Chip
                    size="small"
                    label={t("filters.clear", "Clear")}
                    onClick={() => clearField(f.field)}
                  />
                )}
              </Stack>
            );
          }

          return null;
        })}
      </Stack>
    </Box>
  );
};

// ------------------------- Export Menu -------------------------
const ExportMenu = ({
  anchorEl,
  onClose,
  options,
  rowsForExport,
  columnsForExport,
}) => {
  const t = useT();
  const open = Boolean(anchorEl);

  const doExport = async (type) => {
    const rows = rowsForExport();
    const cols = columnsForExport();
    const fnameBase = options?.fileNameBase || "export";
    const style = options?.styles || {};

    if (type === "csv") {
      const csv = toCSV(rows, cols);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      saveAs(blob, `${fnameBase}.csv`);
    } else if (type === "excel") {
      await exportExcel(rows, cols, `${fnameBase}.xlsx`, style.excel);
    } else if (type === "pdf") {
      exportPDF(rows, cols, `${fnameBase}.pdf`, style.pdf);
    } else if (type === "quickbooks") {
      exportQuickBooksJSON(
        rows,
        options?.quickBooksMapping || {},
        `${fnameBase}-quickbooks.json`
      );
    } else if (type === "fmcsa") {
      exportFMCSAPDF(rows, cols, style.fmcsa || {}, `${fnameBase}-fmcsa.pdf`);
    }
    onClose?.();
  };

  return (
    <Menu anchorEl={anchorEl} open={open} onClose={onClose} keepMounted>
      {(options?.types || ["csv", "excel", "pdf", "quickbooks", "fmcsa"]).map(
        (type) => {
          const icon =
            type === "csv" ? (
              <TableViewOutlinedIcon />
            ) : type === "excel" ? (
              <GridOnOutlinedIcon />
            ) : type === "pdf" ? (
              <PictureAsPdfOutlinedIcon />
            ) : type === "quickbooks" ? (
              <DataObjectOutlinedIcon />
            ) : (
              <PictureAsPdfOutlinedIcon />
            );
          const labelKey = options?.labelKeys?.[type] || `exports.${type}`;
          return (
            <MenuItem key={type} onClick={() => doExport(type)}>
              <ListItemIcon>{icon}</ListItemIcon>
              <ListItemText>{t(labelKey, type.toUpperCase())}</ListItemText>
            </MenuItem>
          );
        }
      )}
    </Menu>
  );
};

// ------------------------- Main Component -------------------------
export default function ConfigurableMRTPage({ config = defaultConfig }) {
  const t = useT();
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.down("md"));

  // Safe back navigation without requiring a Router
  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      // fallback action (e.g., go to home)
      window.location.href = "/";
    }
  };

  // Filters state (per field)
  const [filtersState, setFiltersState] = useState({});
  // Pagination/sorting for potential server usage
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [sorting, setSorting] = useState([]); // [{id:'field', desc:false}]

  const {
    data: rawData,
    loading,
    error,
  } = useConfigurableData(config, filtersState, pagination, sorting);

  // Columns with i18n headers
  const columns = useMemo(
    () =>
      (config.columns || []).map((c) => ({
        accessorKey: c.accessorKey,
        header: t(c.headerKey, c.header || c.accessorKey),
        size: c.size || 150,
        Cell: c.Cell, // optional custom renderer
      })),
    [config.columns, t]
  );

  // When using client-side filtering, apply here
  const filteredData = useMemo(() => {
    if (config?.server?.filtering) return rawData || [];
    return applyClientFilters(rawData || [], config.filters, filtersState);
  }, [rawData, filtersState, config]);

  // MRT table instance
  const table = useMaterialReactTable({
    columns,
    data: filteredData,
    enableSorting: true,
    enableColumnActions: false,
    enableColumnFilters: false,
    enableGlobalFilter: false,
    enableFullScreenToggle: false,
    enableRowSelection: true,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    initialState: { density: "compact" },
    layoutMode: "semantic",
    muiTableContainerProps: { sx: { maxHeight: "calc(100vh - 240px)" } },
    renderTopToolbarCustomActions: () => null,
  });

  // Export menu anchor
  const [exportAnchor, setExportAnchor] = useState(null);

  // Drawer for filters on small screens
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Which rows to export? Prefer selected, else use filtered
  const rowsForExport = () => {
    const selected = table
      .getSelectedRowModel()
      .flatRows.map((r) => r.original);
    return (selected.length ? selected : filteredData).map((r) =>
      sanitizeRowForExport(r)
    );
  };
  const columnsForExport = () =>
    columns.map((c) => ({ accessorKey: c.accessorKey, header: c.header }));

  const sanitizeRowForExport = (row) => {
    const copy = { ...row };
    Object.keys(copy).forEach((k) => {
      const v = copy[k];
      if (v instanceof Date) copy[k] = dayjs(v).format("YYYY-MM-DD HH:mm");
    });
    return copy;
  };

  const content = (
    /*  <Box sx={{ p: 2 }}> */
    <Box sx={{ p: { xs: 0.5, sm: 2 } }}>
      {/* Header Bar */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 2, flexWrap: "wrap" }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton onClick={handleBack} aria-label={t("nav.back", "Back")}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6">
            {t(config.titleKey, config.title || "Data")}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          {isSm ? (
            <Button
              startIcon={<FilterAltOutlinedIcon />}
              variant="outlined"
              onClick={() => setDrawerOpen(true)}
            >
              {t("filters.open", "Filters")}
            </Button>
          ) : (
            <DetachedFilters
              config={config}
              filtersState={filtersState}
              setFiltersState={setFiltersState}
            />
          )}

          <Button
            startIcon={<DownloadOutlinedIcon />}
            variant="contained"
            onClick={(e) => setExportAnchor(e.currentTarget)}
          >
            {t(config.export?.labelKey || "exports.export", "Export")}
          </Button>
          <ExportMenu
            anchorEl={exportAnchor}
            onClose={() => setExportAnchor(null)}
            rowsForExport={rowsForExport}
            columnsForExport={columnsForExport}
            options={config.export}
          />
        </Stack>
      </Stack>

      {/* Filters Drawer for small screens */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        <Box
          role="presentation"
          sx={{ width: 340, pt: 2, pb: 2, pl: 2, pr: 3 }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 1 }}
          >
            <Typography variant="subtitle1">
              {t("filters.title", "Filters")}
            </Typography>
            <IconButton onClick={() => setDrawerOpen(false)}>
              <MoreVertIcon />
            </IconButton>
          </Stack>
          <DetachedFilters
            config={config}
            filtersState={filtersState}
            setFiltersState={setFiltersState}
            inDrawer
          />
        </Box>
      </Drawer>

      {/* Table */}
      <Box
        sx={{
          width: "100%",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          overflow: "hidden",
          bgcolor: "background.paper",
        }}
      >
        <MaterialReactTable table={table} />
      </Box>

      <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {t("table.rowsCount", {
            count: filteredData.length,
            defaultValue: "{{count}} rows",
          })}
        </Typography>
        {loading && (
          <Typography variant="body2">
            {t("common.loading", "Loading...")}
          </Typography>
        )}
        {error && (
          <Typography variant="body2" color="error">
            {t("common.error", "Error")}: {error}
          </Typography>
        )}
      </Stack>
    </Box>
  );

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {content}
    </Box>
  );
}

// ------------------------- Example Config & Mock Data -------------------------

const mockDrivers = [
  {
    id: 1,
    name: "Alemu Bekele",
    status: "Active",
    location: "Addis Ababa",
    createdAt: "2025-05-01T10:00:00Z",
  },
  {
    id: 2,
    name: "Hanna Tadesse",
    status: "Inactive",
    location: "Adama",
    createdAt: "2025-03-15T12:30:00Z",
  },
  {
    id: 3,
    name: "Samuel Kebede",
    status: "Active",
    location: "Bahir Dar",
    createdAt: "2025-07-21T09:15:00Z",
  },
  {
    id: 4,
    name: "Ruth Abate",
    status: "Active",
    location: "Hawassa",
    createdAt: "2024-11-09T16:45:00Z",
  },
  {
    id: 5,
    name: "Yared Dagne",
    status: "Inactive",
    location: "Dire Dawa",
    createdAt: "2023-01-10T08:00:00Z",
  },
  {
    id: 6,
    name: "Lulit Mulu",
    status: "Active",
    location: "Mekelle",
    createdAt: "2025-08-02T14:20:00Z",
  },
  {
    id: 7,
    name: "Abel Girma",
    status: "Active",
    location: "Gondar",
    createdAt: "2022-07-18T11:10:00Z",
  },
  {
    id: 8,
    name: "Mimi Getachew",
    status: "Inactive",
    location: "Jimma",
    createdAt: "2021-10-05T13:55:00Z",
  },
  {
    id: 9,
    name: "Sena Haile",
    status: "Active",
    location: "Shashemene",
    createdAt: "2025-06-11T07:05:00Z",
  },
  {
    id: 10,
    name: "Kaleab Yosef",
    status: "Inactive",
    location: "Harar",
    createdAt: "2020-02-22T19:35:00Z",
  },
];

export const defaultConfig = {
  titleKey: "drivers.title",
  title: "Drivers",
  dataSource: {
    // Toggle between 'mock' and 'api'
    mode: "mock",
    mockData: mockDrivers,
    // Example API source
    // mode: 'api',
    // url: 'https://api.example.com/drivers',
    // method: 'GET',
    // headers: { Authorization: 'Bearer <token>' },
    // transform: (payload) => payload.items, // optional transform from API response
  },
  server: {
    filtering: false, // set true to push filters to server via query params
    sorting: false,
    pagination: false,
  },
  columns: [
    { accessorKey: "name", headerKey: "drivers.table.columns.name" },
    { accessorKey: "status", headerKey: "drivers.table.columns.status" },
    { accessorKey: "location", headerKey: "drivers.table.columns.location" },
    {
      accessorKey: "createdAt",
      headerKey: "drivers.table.columns.createdAt",
      Cell: ({ cell }) => dayjs(cell.getValue()).format("YYYY-MM-DD"),
    },
  ],
  filters: [
    {
      type: "select",
      field: "status",
      labelKey: "drivers.filters.status",
      includeEmpty: true,
      options: [
        { value: "Active", labelKey: "drivers.status.active" },
        { value: "Inactive", labelKey: "drivers.status.inactive" },
      ],
    },
    {
      type: "text",
      field: "location",
      labelKey: "drivers.filters.location",
      placeholderKey: "drivers.filters.location.placeholder",
    },
    {
      type: "date",
      field: "createdAt",
      labelKey: "drivers.filters.createdAt",
      // presets optional; if omitted defaults used
      presets: [
        { key: "filters.date.last7Days", preset: { type: "lastNDays", n: 7 } },
        {
          key: "filters.date.last30Days",
          preset: { type: "lastNDays", n: 30 },
        },
        {
          key: "filters.date.quarterToDate",
          preset: { type: "quarterToDate" },
        },
        {
          key: "filters.date.last5Years",
          preset: { type: "lastNYears", n: 5 },
        },
      ],
    },
  ],
  export: {
    labelKey: "exports.export",
    types: ["csv", "excel", "pdf", "quickbooks", "fmcsa"],
    fileNameBase: "drivers",
    labelKeys: {
      csv: "exports.csv",
      excel: "exports.excel",
      pdf: "exports.pdf",
      quickbooks: "exports.quickbooks",
      fmcsa: "exports.fmcsa",
    },
    styles: {
      excel: { header: { bold: true } },
      pdf: {
        title: "Drivers Report",
        titleFontSize: 14,
        headStyles: { fillColor: [240, 240, 240] },
        tableStyles: { fontSize: 9 },
      },
      fmcsa: {
        title: "FMCSA Driver Roster",
        titleFontSize: 16,
        headStyles: { fillColor: [230, 230, 230] },
        tableStyles: { fontSize: 9 },
      },
    },
    // Map your table fields → QuickBooks fields for JSON export
    quickBooksMapping: {
      name: "DisplayName",
      status: "Active",
      createdAt: "Meta.CreateTime",
      location: "BillAddr.City",
    },
  },
};
