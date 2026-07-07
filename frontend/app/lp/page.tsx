import LpClient from "./LpClient";

// lp.czero.sbs — "Resgate o material dos Reels". A standalone lead-capture
// funnel (name + WhatsApp + 3 quick qualifiers) that hands the visitor to the
// free WhatsApp group and the Central de Material. Served on the lp.czero.sbs
// host via nginx; also reachable at /lp on any host for testing. Distinct from
// the main sales landing (app/page.tsx), which it does NOT replace.
export default function Page() {
  return <LpClient />;
}
