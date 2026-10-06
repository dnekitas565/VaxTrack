import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Package, Plus } from 'lucide-react';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Button, Card, Chip, EmptyState, Field, Modal, PageHeader, QueryBoundary, Skeleton, inputClass, useToast } from '../components/ui.jsx';
import { fmtDate, plural, todayStr } from '../lib/format.js';

function ExpiryBadge({ days }) {
  if (days < 0) return <Chip tone="overdue"><AlertTriangle className="size-3" aria-hidden="true" />Expired</Chip>;
  if (days <= 30) return <Chip tone="due">Expires in {plural(days, 'day')}</Chip>;
  return <Chip tone="neutral">Valid</Chip>;
}

function StockBadge({ row }) {
  if (row.quantity === 0) return <Chip tone="overdue">Out of stock</Chip>;
  if (row.is_low === 'Y') return <Chip tone="due">Low stock</Chip>;
  return null;
}

function RestockModal({ onClose, defaultClinic }) {
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ clinicId: defaultClinic || '', vaccineId: '', batchNo: '', expiryDate: '', quantity: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const vaccines = useQuery({ queryKey: ['vaccines'], queryFn: () => api.get('/vaccines'), staleTime: 300_000 });
  const clinics = useQuery({ queryKey: ['clinics'], queryFn: () => api.get('/clinics'), enabled: isAdmin });

  const restock = useMutation({
    mutationFn: () =>
      api.post('/inventory/restock', {
        ...(isAdmin ? { clinicId: Number(f.clinicId) } : {}),
        vaccineId: Number(f.vaccineId),
        batchNo: f.batchNo.trim(),
        expiryDate: f.expiryDate,
        quantity: Number(f.quantity),
      }),
    onSuccess: () => {
      toast.success('Stock added');
      for (const k of ['inventory', 'alerts', 'dashboard']) qc.invalidateQueries({ queryKey: [k] });
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  function submit() {
    setError('');
    const e = {};
    if (isAdmin && !f.clinicId) e.clinicId = 'Choose a clinic.';
    if (!f.vaccineId) e.vaccineId = 'Choose a vaccine.';
    if (!f.batchNo.trim()) e.batchNo = 'Enter the batch number.';
    if (!f.expiryDate) e.expiryDate = 'Enter the expiry date.';
    else if (f.expiryDate < todayStr()) e.expiryDate = 'The batch is already expired.';
    if (!(Number(f.quantity) >= 1) || !Number.isInteger(Number(f.quantity))) e.quantity = 'Enter a whole number of doses, 1 or more.';
    setErrors(e);
    if (Object.keys(e).length === 0) restock.mutate();
  }

  return (
    <Modal
      title="Restock vaccine"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={restock.isPending}>
            Cancel
          </Button>
          <Button icon={Plus} loading={restock.isPending} onClick={submit}>
            Add stock
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-700">An existing batch number gets the quantity added to it; a new batch number creates a new batch.</p>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </p>
        )}
        {isAdmin && (
          <Field label="Clinic" error={errors.clinicId}>
            {(p) => (
              <select {...p} className={inputClass} value={f.clinicId} onChange={set('clinicId')}>
                <option value="">Choose…</option>
                {clinics.data?.map((c) => <option key={c.clinic_id} value={c.clinic_id}>{c.clinic_name}</option>)}
              </select>
            )}
          </Field>
        )}
        <Field label="Vaccine" error={errors.vaccineId}>
          {(p) => (
            <select {...p} className={inputClass} value={f.vaccineId} onChange={set('vaccineId')}>
              <option value="">Choose…</option>
              {vaccines.data?.map((v) => <option key={v.vaccine_id} value={v.vaccine_id}>{v.vaccine_label}{v.is_regional === 'Y' ? ' (JE areas)' : ''}</option>)}
            </select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Batch number" error={errors.batchNo}>
            {(p) => <input {...p} className={inputClass} value={f.batchNo} onChange={set('batchNo')} maxLength={40} autoComplete="off" />}
          </Field>
          <Field label="Expiry date" error={errors.expiryDate}>
            {(p) => <input {...p} type="date" min={todayStr()} className={inputClass} value={f.expiryDate} onChange={set('expiryDate')} />}
          </Field>
        </div>
        <Field label="Quantity (doses)" error={errors.quantity}>
          {(p) => <input {...p} type="number" min="1" step="1" inputMode="numeric" className={inputClass} value={f.quantity} onChange={set('quantity')} />}
        </Field>
      </div>
    </Modal>
  );
}

export default function Inventory() {
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const [clinicId, setClinicId] = useState('');
  const [attention, setAttention] = useState(false);
  const [restocking, setRestocking] = useState(false);

  const clinics = useQuery({ queryKey: ['clinics'], queryFn: () => api.get('/clinics'), enabled: isAdmin });
  const inventory = useQuery({
    queryKey: ['inventory', isAdmin ? clinicId || 'all' : 'own'],
    queryFn: () => api.get(`/inventory${qs({ clinicId: isAdmin ? clinicId : '' })}`),
  });

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle={isAdmin ? 'Vaccine batches by clinic' : `Vaccine batches at ${user.clinicName}`}
        actions={
          <>
            {isAdmin && (
              <div>
                <label htmlFor="inv-clinic" className="sr-only">Clinic</label>
                <select id="inv-clinic" className={`${inputClass} min-w-52`} value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
                  <option value="">All clinics</option>
                  {clinics.data?.map((c) => <option key={c.clinic_id} value={c.clinic_id}>{c.clinic_name}</option>)}
                </select>
              </div>
            )}
            <Button icon={Plus} onClick={() => setRestocking(true)}>Restock</Button>
          </>
        }
      />

      <label className="mb-3 flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-5 accent-primary-700" checked={attention} onChange={(e) => setAttention(e.target.checked)} />
        Only batches that need attention (low, empty, expired or expiring within 30 days)
      </label>

      <QueryBoundary query={inventory} skeleton={<Skeleton className="h-72 w-full" />}>
        {(all) => {
          const rows = attention ? all.filter((r) => r.is_low === 'Y' || r.quantity === 0 || r.days_to_expiry <= 30) : all;
          return rows.length === 0 ? (
            <Card>
              <EmptyState icon={Package} title={attention ? 'Nothing needs attention' : 'No stock recorded'}>
                {attention ? 'Every batch has enough stock and is not close to expiry.' : 'Use Restock to add the first batch.'}
              </EmptyState>
            </Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <caption className="sr-only">Vaccine batches with quantity and expiry</caption>
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th scope="col" className="px-4 py-3">Vaccine</th>
                    {isAdmin && <th scope="col" className="px-4 py-3">Clinic</th>}
                    <th scope="col" className="px-4 py-3">Batch</th>
                    <th scope="col" className="px-4 py-3">Expiry</th>
                    <th scope="col" className="px-4 py-3 text-right">In stock</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.inventory_id}>
                      <th scope="row" className="px-4 py-3 font-medium">{r.vaccine_label}<span className="block text-xs font-normal text-slate-600">{r.age_label}</span></th>
                      {isAdmin && <td className="px-4 py-3">{r.clinic_name}</td>}
                      <td className="px-4 py-3 font-mono text-xs">{r.batch_no}</td>
                      <td className="px-4 py-3">{fmtDate(r.expiry_date)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.quantity}<span className="block text-xs text-slate-600">alert below {r.low_stock_threshold}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <ExpiryBadge days={r.days_to_expiry} />
                          <StockBadge row={r} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        }}
      </QueryBoundary>
      {restocking && <RestockModal onClose={() => setRestocking(false)} defaultClinic={isAdmin ? clinicId : ''} />}
    </>
  );
}
