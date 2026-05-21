import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import {
  Search,
  Download,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  Truck,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Database,
  Users,
  Radio,
  ExternalLink,
  Info,
  Mail,
} from "lucide-react";
import { toast } from "sonner";

interface Carrier {
  docket1: string;
  dot_number: string;
  legal_name: string;
  phy_state: string;
  phone: string;
  email_address: string;
  total_drivers: string;
  power_units: string;
  carrier_operation: string;
}

const FMCSA_API = "https://data.transportation.gov/resource/az4n-8mr2.json";
const SELECT_FIELDS = "docket1,dot_number,legal_name,phy_state,phone,email_address,total_drivers,power_units,carrier_operation";

function saferWebUrl(dotNumber: string) {
  return `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${dotNumber}`;
}

function useCopyCell() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text ?? "").then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    });
  }, []);
  return { copiedKey, copy };
}

function CopyButton({
  text,
  id,
  copiedKey,
  onCopy,
}: {
  text: string;
  id: string;
  copiedKey: string | null;
  onCopy: (text: string, id: string) => void;
}) {
  const copied = copiedKey === id;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onCopy(text, id); }}
      className="ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 flex-shrink-0"
      title={copied ? "Copied!" : "Copy"}
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string | number; color: string;
}) {
  return (
    <div className="bg-card border border-card-border rounded-lg px-5 py-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold text-foreground leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [startMC, setStartMC] = useState("");
  const [endMC, setEndMC] = useState("");
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters] = useState<ColumnFiltersState>([]);
  const [emailsOnly, setEmailsOnly] = useState(false);
  const [selectedStates, setSelectedStates] = useState<Set<string>>(new Set());
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [copiedColKey, setCopiedColKey] = useState<string | null>(null);
  const { copiedKey, copy } = useCopyCell();
  const tableRef = useRef<HTMLDivElement>(null);
  const stateDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (stateDropdownRef.current && !stateDropdownRef.current.contains(e.target as Node)) {
        setStateDropdownOpen(false);
      }
    }
    if (stateDropdownOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [stateDropdownOpen]);

  const fetchCarriers = useCallback(async () => {
    if (!startMC.trim() || !endMC.trim()) {
      toast.error("Please enter both Start and End MC numbers.");
      return;
    }
    setLoading(true);
    setError(null);
    setCarriers([]);
    setGlobalFilter("");
    setSelectedStates(new Set());
    try {
      const start = parseInt(startMC.trim().replace(/^MC[-\s]*/i, ""), 10);
      const end = parseInt(endMC.trim().replace(/^MC[-\s]*/i, ""), 10);
      if (isNaN(start) || isNaN(end)) throw new Error("MC numbers must be numeric (e.g. 100000 to 101000).");
      if (start > end) throw new Error("Start MC must be less than or equal to End MC.");
      const where = `docket1prefix = 'MC' AND docket1::number >= ${start} AND docket1::number <= ${end}`;
      const url = `${FMCSA_API}?$where=${encodeURIComponent(where)}&$limit=10000&$select=${encodeURIComponent(SELECT_FIELDS)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`API error ${res.status}: ${body || res.statusText}`);
      }
      const data: Carrier[] = await res.json();
      setCarriers(data);
      if (data.length === 0) {
        toast.info("No carriers found for that MC range.");
      } else {
        toast.success(`Loaded ${data.length.toLocaleString()} carriers.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      toast.error("Failed to fetch data.");
    } finally {
      setLoading(false);
    }
  }, [startMC, endMC]);

  const columns = useMemo<ColumnDef<Carrier>[]>(() => {
    function colHeader(label: string, field: keyof Carrier) {
      return ({ column }: { column: { getIsSorted: () => false | "asc" | "desc"; toggleSorting: (desc?: boolean) => void; id: string } }) => {
        const sorted = column.getIsSorted();
        const copyCol = () => {
          const rows = table.getFilteredRowModel().rows;
          const values = rows.map((r) => (r.original[field] ?? "").toString().trim()).filter(Boolean).join("\n");
          navigator.clipboard.writeText(values).then(() => {
            setCopiedColKey(column.id);
            setTimeout(() => setCopiedColKey(null), 1600);
            toast.success(`Copied ${rows.length} "${label}" values`);
          });
        };
        return (
          <div className="flex items-center gap-1 group/header">
            <button
              className="flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => column.toggleSorting(sorted === "asc")}
            >
              {label}
              {sorted === "asc" ? <ChevronUp className="w-3.5 h-3.5 text-primary" /> : sorted === "desc" ? <ChevronDown className="w-3.5 h-3.5 text-primary" /> : <ChevronsUpDown className="w-3.5 h-3.5 opacity-30" />}
            </button>
            <button
              onClick={copyCol}
              className="ml-1 opacity-0 group-hover/header:opacity-100 transition-opacity inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10"
              title={`Copy all ${label}`}
            >
              {copiedColKey === column.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        );
      };
    }

    const makeCell = (field: keyof Carrier, rowIndex: number, value: string) => {
      const id = `${field}-${rowIndex}`;
      return (
        <div className="flex items-center group min-w-0">
          <span className="truncate text-sm text-foreground">{value || "—"}</span>
          {value ? <CopyButton text={value} id={id} copiedKey={copiedKey} onCopy={copy} /> : null}
        </div>
      );
    };

    return [
      {
        id: "safer_link",
        accessorKey: "dot_number",
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SAFER</span>
        ),
        cell: ({ row }) => {
          const dot = row.original.dot_number;
          if (!dot) return <span className="text-muted-foreground text-sm">—</span>;
          return (
            <a
              href={saferWebUrl(dot)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 hover:underline transition-colors font-medium"
              title="Verify on SAFER Web"
            >
              Verify <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
          );
        },
        size: 80,
        enableSorting: false,
      },
      {
        id: "docket1",
        accessorKey: "docket1",
        header: colHeader("MC Number", "docket1"),
        cell: ({ row, getValue }) => makeCell("docket1", row.index, (getValue() as string) ?? ""),
        size: 110,
      },
      {
        id: "dot_number",
        accessorKey: "dot_number",
        header: colHeader("DOT Number", "dot_number"),
        cell: ({ row, getValue }) => makeCell("dot_number", row.index, (getValue() as string) ?? ""),
        size: 110,
      },
      {
        id: "legal_name",
        accessorKey: "legal_name",
        header: colHeader("Legal Name", "legal_name"),
        cell: ({ row, getValue }) => makeCell("legal_name", row.index, (getValue() as string) ?? ""),
        size: 200,
      },
      {
        id: "phy_state",
        accessorKey: "phy_state",
        header: colHeader("State", "phy_state"),
        cell: ({ row, getValue }) => makeCell("phy_state", row.index, (getValue() as string) ?? ""),
        size: 68,
      },
      {
        id: "phone",
        accessorKey: "phone",
        header: colHeader("Phone", "phone"),
        cell: ({ row, getValue }) => makeCell("phone", row.index, (getValue() as string) ?? ""),
        size: 130,
      },
      {
        id: "email_address",
        accessorKey: "email_address",
        header: colHeader("Email", "email_address"),
        cell: ({ row, getValue }) => makeCell("email_address", row.index, (getValue() as string) ?? ""),
        size: 210,
      },
      {
        id: "total_drivers",
        accessorKey: "total_drivers",
        header: colHeader("Drivers", "total_drivers"),
        cell: ({ row, getValue }) => makeCell("total_drivers", row.index, (getValue() as string) ?? ""),
        size: 75,
      },
      {
        id: "power_units",
        accessorKey: "power_units",
        header: colHeader("Power Units", "power_units"),
        cell: ({ row, getValue }) => makeCell("power_units", row.index, (getValue() as string) ?? ""),
        size: 95,
      },
      {
        id: "carrier_operation",
        accessorKey: "carrier_operation",
        header: colHeader("Operation", "carrier_operation"),
        cell: ({ row, getValue }) => makeCell("carrier_operation", row.index, (getValue() as string) ?? ""),
        size: 100,
      },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copiedKey, copy, copiedColKey]);

  const table = useReactTable({
    data: carriers,
    columns,
    state: { globalFilter, sorting, columnFilters },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: "includesString",
  });

  const availableStates = useMemo(() => {
    const s = new Set<string>();
    carriers.forEach((c) => { if (c.phy_state?.trim()) s.add(c.phy_state.trim().toUpperCase()); });
    return Array.from(s).sort();
  }, [carriers]);

  const toggleState = useCallback((state: string) => {
    setSelectedStates((prev) => {
      const next = new Set(prev);
      if (next.has(state)) next.delete(state); else next.add(state);
      return next;
    });
  }, []);

  const filteredRows = useMemo(() => {
    let rows = table.getFilteredRowModel().rows;
    if (selectedStates.size > 0) rows = rows.filter((r) => selectedStates.has((r.original.phy_state ?? "").trim().toUpperCase()));
    if (emailsOnly) rows = rows.filter((r) => r.original.email_address?.trim());
    return rows;
  }, [table.getFilteredRowModel().rows, emailsOnly, selectedStates]);

  const exportCSV = useCallback(() => {
    if (filteredRows.length === 0) { toast.error("No data to export."); return; }
    const headers = ["MC Number", "DOT Number", "Legal Name", "State", "Phone", "Email", "Total Drivers", "Power Units", "Carrier Operation", "SAFER Web Link"];
    const fields: (keyof Carrier)[] = ["docket1", "dot_number", "legal_name", "phy_state", "phone", "email_address", "total_drivers", "power_units", "carrier_operation"];
    const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const rows = filteredRows.map((r) => [
      ...fields.map((f) => escape(r.original[f] ?? "")),
      escape(r.original.dot_number ? saferWebUrl(r.original.dot_number) : ""),
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fmcsa_carriers_mc${startMC}_to_mc${endMC}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredRows.length.toLocaleString()} rows to CSV.`);
  }, [filteredRows, startMC, endMC]);

  const withEmailCount = useMemo(
    () => filteredRows.filter((r) => r.original.email_address?.trim()).length,
    [filteredRows]
  );

  const totalDrivers = useMemo(() => {
    const sum = filteredRows.reduce((acc, r) => acc + (parseInt(r.original.total_drivers ?? "0", 10) || 0), 0);
    return sum.toLocaleString();
  }, [filteredRows]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-[1800px] mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Truck className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground tracking-tight">FMCSA Carrier Census Data Extractor</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">data.transportation.gov &mdash; FMCSA Company Census</p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground hidden md:block">
            {carriers.length > 0 ? `${filteredRows.length.toLocaleString()} / ${carriers.length.toLocaleString()} records` : "No data loaded"}
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-[1800px] mx-auto w-full px-6 py-6 flex flex-col gap-5">
        {/* Fetch Controls */}
        <div className="bg-card border border-card-border rounded-xl p-5">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Start MC Number</label>
              <input
                type="text"
                value={startMC}
                onChange={(e) => setStartMC(e.target.value)}
                placeholder="e.g. 100000"
                className="bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all w-full"
                onKeyDown={(e) => e.key === "Enter" && fetchCarriers()}
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">End MC Number</label>
              <input
                type="text"
                value={endMC}
                onChange={(e) => setEndMC(e.target.value)}
                placeholder="e.g. 101000"
                className="bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all w-full"
                onKeyDown={(e) => e.key === "Enter" && fetchCarriers()}
              />
            </div>
            <button
              onClick={fetchCarriers}
              disabled={loading}
              className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed px-6 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 h-[42px]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              {loading ? "Fetching..." : "Fetch Data"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Enter numeric MC numbers only (e.g. <span className="text-foreground font-medium">100000</span> to <span className="text-foreground font-medium">101000</span>). The &ldquo;MC-&rdquo; prefix is stripped automatically. Max 10,000 results per query.
          </p>
        </div>

        {/* Data freshness notice */}
        <div className="flex items-start gap-3 bg-yellow-500/8 border border-yellow-500/20 rounded-xl px-5 py-3.5">
          <Info className="w-4 h-4 text-yellow-400/80 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-yellow-400/90 font-semibold">Census snapshot data</span> — this source (FMCSA Company Census file) is a periodic export, not real-time. Phone numbers, emails, and legal names may be outdated for some carriers. Use the{" "}
            <span className="text-foreground font-medium">Verify</span> link on each row to confirm current details on{" "}
            <a href="https://safer.fmcsa.dot.gov" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">SAFER Web</a>.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-5 py-4">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-sm">Fetch Failed</div>
              <div className="text-sm opacity-80 mt-0.5 font-mono">{error}</div>
            </div>
          </div>
        )}

        {/* Stats */}
        {carriers.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Database} label="Visible Records" value={filteredRows.length.toLocaleString()} color="bg-primary/10 text-primary" />
            <StatCard icon={Radio} label="With Email" value={withEmailCount.toLocaleString()} color="bg-green-500/10 text-green-400" />
            <StatCard icon={Users} label="Total Drivers" value={totalDrivers} color="bg-yellow-500/10 text-yellow-400" />
            <StatCard icon={Truck} label="Total Fetched" value={carriers.length.toLocaleString()} color="bg-purple-500/10 text-purple-400" />
          </div>
        )}

        {/* Table Controls */}
        {carriers.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder="Search table (e.g. @gmail, TX, flatbed...)"
                className="w-full bg-card border border-input rounded-lg pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* State filter dropdown */}
              <div className="relative" ref={stateDropdownRef}>
                <button
                  onClick={() => setStateDropdownOpen((v) => !v)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all whitespace-nowrap ${
                    selectedStates.size > 0
                      ? "bg-primary/15 border-primary/40 text-primary hover:bg-primary/20"
                      : "bg-secondary border-secondary-border text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  <Radio className="w-4 h-4" />
                  {selectedStates.size > 0 ? `States (${selectedStates.size})` : "All States"}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${stateDropdownOpen ? "rotate-180" : ""}`} />
                </button>
                {stateDropdownOpen && availableStates.length > 0 && (
                  <div className="absolute right-0 top-full mt-1 z-30 bg-card border border-card-border rounded-xl shadow-lg w-52 py-1 max-h-64 overflow-y-auto">
                    {selectedStates.size > 0 && (
                      <button
                        onClick={() => setSelectedStates(new Set())}
                        className="w-full text-left px-4 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors font-semibold border-b border-border"
                      >
                        Clear selection
                      </button>
                    )}
                    {availableStates.map((state) => (
                      <button
                        key={state}
                        onClick={() => toggleState(state)}
                        className="w-full flex items-center justify-between px-4 py-2 text-sm text-foreground hover:bg-muted/40 transition-colors"
                      >
                        <span>{state}</span>
                        {selectedStates.has(state) && <Check className="w-3.5 h-3.5 text-primary" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Emails only toggle */}
              <button
                onClick={() => setEmailsOnly((v) => !v)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all whitespace-nowrap ${
                  emailsOnly
                    ? "bg-green-500/15 border-green-500/40 text-green-400 hover:bg-green-500/20"
                    : "bg-secondary border-secondary-border text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                <Mail className="w-4 h-4" />
                {emailsOnly ? "Emails only ✓" : "Emails only"}
              </button>

              {/* CSV export */}
              <button
                onClick={exportCSV}
                className="flex items-center gap-2 bg-secondary border border-secondary-border text-secondary-foreground hover:bg-secondary/80 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                Download CSV ({filteredRows.length.toLocaleString()})
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && carriers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <p className="text-muted-foreground text-sm">Fetching from FMCSA Census API&hellip;</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && carriers.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <div className="w-16 h-16 rounded-2xl bg-card border border-card-border flex items-center justify-center">
              <Truck className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-foreground font-semibold">No data loaded</p>
              <p className="text-muted-foreground text-sm mt-1">Enter an MC number range above and click Fetch Data.</p>
            </div>
          </div>
        )}

        {/* Data Table */}
        {carriers.length > 0 && (
          <div ref={tableRef} className="bg-card border border-card-border rounded-xl overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="bg-muted/60 border-b border-border">
                      {hg.headers.map((header) => (
                        <th
                          key={header.id}
                          className="px-4 py-3 text-left first:pl-5 last:pr-5"
                          style={{ width: header.getSize(), minWidth: header.getSize() }}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className="text-center py-16 text-muted-foreground text-sm">
                        No results match your search.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, i) => (
                      <tr
                        key={row.id}
                        className={`border-b border-border/50 last:border-0 transition-colors hover:bg-muted/30 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            className="px-4 py-2.5 first:pl-5 last:pr-5"
                            style={{ width: cell.column.getSize(), minWidth: cell.column.getSize(), maxWidth: cell.column.getSize() }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {filteredRows.length > 0 && (
              <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
                <span>
                  Showing <strong className="text-foreground">{filteredRows.length.toLocaleString()}</strong> of <strong className="text-foreground">{carriers.length.toLocaleString()}</strong> carriers
                </span>
                <span>Hover column headers to copy all &bull; Hover cells to copy individually</span>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
