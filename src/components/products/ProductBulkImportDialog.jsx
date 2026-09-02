import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  downloadProductImportErrors,
  downloadProductImportTemplate,
  parseProductSpreadsheet,
  validateProductImport,
} from '@/lib/productSpreadsheet';
import {
  createProductImportJob,
  importMasterProducts,
  updateProductImportJob,
} from '@/lib/productCatalogRepository';

const INITIAL_PROGRESS = { percent: 0, processed: 0, created: 0, updated: 0, failed: 0, branch_added: 0 };

function SummaryCard({ tone, icon: Icon, label, value }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className={cn('mb-2 flex h-8 w-8 items-center justify-center rounded-lg', tones[tone])}><Icon className="h-4 w-4" /></div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-black text-slate-950 dark:text-white">{Number(value || 0).toLocaleString()}</p>
    </div>
  );
}

export default function ProductBulkImportDialog({ open, onOpenChange, restaurantId, selectedBranch, onImported }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [validation, setValidation] = useState(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [activateBranch, setActivateBranch] = useState(Boolean(selectedBranch));
  const [progress, setProgress] = useState(INITIAL_PROGRESS);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (open) setActivateBranch(Boolean(selectedBranch));
  }, [open, selectedBranch]);

  const branchName = selectedBranch?.name || selectedBranch?.label || selectedBranch?.branch_key || 'selected branch';
  const previewRows = useMemo(() => validation?.validRows?.slice(0, 50) || [], [validation]);

  const reset = () => {
    setFile(null);
    setValidation(null);
    setReading(false);
    setImporting(false);
    setProgress(INITIAL_PROGRESS);
    setCompleted(false);
  };

  const handleOpenChange = (nextOpen) => {
    if (importing) return;
    onOpenChange(nextOpen);
    if (!nextOpen) reset();
  };

  const readFile = async (nextFile) => {
    if (!nextFile) return;
    setFile(nextFile);
    setValidation(null);
    setCompleted(false);
    setProgress(INITIAL_PROGRESS);
    setReading(true);
    try {
      const records = await parseProductSpreadsheet(nextFile);
      const result = validateProductImport(records);
      setValidation(result);
      if (!result.validRows.length) toast.error('No valid product rows were found.');
    } catch (error) {
      setFile(null);
      toast.error(error?.message || 'Unable to read the spreadsheet.');
    } finally {
      setReading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const runImport = async () => {
    if (!restaurantId || !file || !validation?.validRows?.length) return;
    setImporting(true);
    setCompleted(false);
    let jobId = null;
    try {
      jobId = await createProductImportJob({
        restaurantId,
        branchId: activateBranch ? selectedBranch?.id || null : null,
        file,
      });
      await updateProductImportJob(jobId, {
        total_rows: validation.totalRows,
        failed_rows: validation.invalidRowCount,
        error_summary: validation.errors.slice(0, 100),
      });
      const result = await importMasterProducts({
        restaurantId,
        branchId: activateBranch ? selectedBranch?.id || null : null,
        rows: validation.validRows,
        onProgress: setProgress,
      });
      const allErrors = [...validation.errors, ...result.errors];
      const failedRows = validation.invalidRowCount + result.failed;
      await updateProductImportJob(jobId, {
        status: failedRows ? 'completed_with_errors' : 'completed',
        processed_rows: result.processed,
        created_rows: result.created,
        updated_rows: result.updated,
        failed_rows: failedRows,
        error_summary: allErrors.slice(0, 100),
        completed_at: new Date().toISOString(),
      });
      setProgress((current) => ({ ...current, ...result, percent: 100, failed: failedRows }));
      setCompleted(true);
      await onImported?.();
      toast.success(`${(result.created + result.updated).toLocaleString()} master products synchronized.`);
    } catch (error) {
      if (jobId) {
        try {
          await updateProductImportJob(jobId, {
            status: 'failed',
            error_summary: [{ message: error?.message || 'Import failed.' }],
            completed_at: new Date().toISOString(),
          });
        } catch {
          // Preserve the original import error for the operator.
        }
      }
      toast.error(error?.message || 'Unable to import the product catalog.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[94dvh] w-[calc(100vw-1rem)] max-w-5xl flex-col overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.14),transparent_46%)] p-5 pr-12 text-left dark:border-slate-800">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <DialogTitle className="text-xl font-black">Enterprise Product Import</DialogTitle>
          <DialogDescription>Validate and synchronize up to 100,000 master products from Excel or CSV. Existing SKUs update safely; new SKUs are created.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {!file ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); readFile(event.dataTransfer.files?.[0]); }}
                className="flex min-h-64 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-6 text-center transition hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-blue-900 dark:bg-blue-950/20"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm dark:bg-slate-950"><UploadCloud className="h-7 w-7" /></span>
                <span className="mt-4 text-lg font-black text-slate-950 dark:text-white">Drop Excel here or choose a file</span>
                <span className="mt-1 text-sm text-slate-500">.xlsx or .csv · maximum 25 MB · 100,000 rows</span>
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" onChange={(event) => readFile(event.target.files?.[0])} />
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  <strong className="text-slate-900 dark:text-white">Required:</strong> Product Name and either SKU or Barcode. Keep barcode columns formatted as Text in Excel.
                </div>
                <Button variant="outline" className="h-11 rounded-xl" onClick={downloadProductImportTemplate}><Download className="mr-2 h-4 w-4" />Download Excel Template</Button>
              </div>
            </div>
          ) : reading ? (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <Loader2 className="h-9 w-9 animate-spin text-blue-600" />
              <p className="mt-4 font-black">Reading and validating spreadsheet…</p>
              <p className="mt-1 text-sm text-slate-500">Large catalogs may take a few seconds.</p>
            </div>
          ) : completed ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white"><CheckCircle2 className="h-7 w-7" /></span>
                <h3 className="mt-4 text-xl font-black text-emerald-950 dark:text-emerald-100">Catalog synchronization complete</h3>
                <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">Master data is ready for search and branch assortment control.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryCard tone="blue" icon={ShieldCheck} label="Processed" value={progress.processed} />
                <SummaryCard tone="green" icon={CheckCircle2} label="Created" value={progress.created} />
                <SummaryCard tone="blue" icon={RefreshCw} label="Updated" value={progress.updated} />
                <SummaryCard tone={progress.failed ? 'red' : 'green'} icon={AlertCircle} label="Failed" value={progress.failed} />
              </div>
              {activateBranch ? <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200"><Building2 className="h-5 w-5 shrink-0" /><span><strong>{progress.branch_added.toLocaleString()}</strong> products activated for {branchName}.</span></div> : null}
            </div>
          ) : validation ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-black text-slate-950 dark:text-white">{file.name}</p>
                  <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB · validation complete</p>
                </div>
                <Button variant="outline" size="sm" disabled={importing} onClick={() => { setFile(null); setValidation(null); }}><RefreshCw className="mr-2 h-4 w-4" />Choose another</Button>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryCard tone="blue" icon={FileSpreadsheet} label="All rows" value={validation.totalRows} />
                <SummaryCard tone="green" icon={CheckCircle2} label="Ready" value={validation.validRows.length} />
                <SummaryCard tone={validation.invalidRowCount ? 'red' : 'green'} icon={AlertCircle} label="Invalid" value={validation.invalidRowCount} />
                <SummaryCard tone={validation.duplicateCount ? 'amber' : 'green'} icon={ShieldCheck} label="Duplicates" value={validation.duplicateCount} />
              </div>

              {selectedBranch ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/25">
                  <input type="checkbox" checked={activateBranch} onChange={(event) => setActivateBranch(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span className="min-w-0"><span className="block font-black text-slate-950 dark:text-white">Also activate products in {branchName}</span><span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-300">Creates branch assortment records without duplicating product master data.</span></span>
                </label>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Products will be added to the organization master only. Select a branch in the Product header to activate them during import.</div>
              )}

              {importing ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/25">
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="font-bold">Synchronizing batch {progress.batch || 1} of {progress.batches || 1}</span><span className="font-black text-blue-700 dark:text-blue-300">{progress.percent}%</span></div>
                  <Progress value={progress.percent} />
                  <p className="mt-2 text-xs text-slate-500">Keep this window open until the import finishes.</p>
                </div>
              ) : null}

              <section className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <div><h3 className="font-black">Validated preview</h3><p className="text-xs text-slate-500">First {previewRows.length.toLocaleString()} ready rows</p></div>
                  {validation.errors.length ? <Button variant="outline" size="sm" onClick={() => downloadProductImportErrors(validation.errors)}><Download className="mr-1.5 h-4 w-4" />Error report</Button> : null}
                </div>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="sticky top-0 bg-white text-[11px] uppercase tracking-wide text-slate-500 shadow-sm dark:bg-slate-950"><tr><th className="px-4 py-3">Row</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">SKU / Barcode</th><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-right">Cost</th><th className="px-4 py-3 text-right">Price</th></tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{previewRows.map((row) => <tr key={`${row._rowNumber}-${row.sku}`}><td className="px-4 py-3 text-slate-500">{row._rowNumber}</td><td className="px-4 py-3"><p className="max-w-60 truncate font-bold text-slate-900 dark:text-white">{row.name}</p><p className="max-w-60 truncate text-xs text-slate-500">{row.brand || 'No brand'}</p></td><td className="px-4 py-3"><p className="font-mono text-xs font-bold">{row.sku}</p><p className="font-mono text-xs text-slate-500">{row.barcode || '—'}</p></td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.category || 'Uncategorized'}</td><td className="px-4 py-3 text-right tabular-nums">{row.purchase_cost.toLocaleString()}</td><td className="px-4 py-3 text-right font-bold tabular-nums">{row.selling_price.toLocaleString()}</td></tr>)}</tbody>
                  </table>
                </div>
              </section>

              {validation.errors.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><strong>{validation.invalidRowCount.toLocaleString()} invalid rows</strong> will be skipped. Download the error report, correct those rows, and import them again later.</div> : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:justify-end">
          <Button variant="outline" className="h-11 rounded-xl" disabled={importing} onClick={() => handleOpenChange(false)}>{completed ? 'Close' : 'Cancel'}</Button>
          {!completed && validation ? <Button className="h-11 rounded-xl px-5 shadow-lg shadow-blue-600/20" disabled={importing || !validation.validRows.length} onClick={runImport}>{importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}Import {validation.validRows.length.toLocaleString()} Products</Button> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
