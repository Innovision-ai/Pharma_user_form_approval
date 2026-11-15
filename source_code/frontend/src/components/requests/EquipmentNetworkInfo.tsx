/** Read-only equipment identity shown on a request: Computer System ID, hostname, IP address. */
export function EquipmentNetworkInfo({ csid, hostname, ip }: { csid?: string | null; hostname?: string | null; ip?: string | null }) {
  const items: [string, string | null | undefined][] = [
    ["Computer System ID", csid],
    ["Hostname", hostname],
    ["IP address", ip],
  ];
  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-3" aria-label="Equipment details">
      {items.map(([label, value]) => (
        <div key={label}>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">{label}</p>
          <p className="font-mono text-sm text-slate-800">{value || "—"}</p>
        </div>
      ))}
    </div>
  );
}
