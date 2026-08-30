import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectBolt11Invoice,
  validateZapInvoice,
  ZapInvoiceValidationError
} from "../src/server/bolt11-invoice";

const UNPUBLISHED_ONE_SAT_INVOICE = "lnbc10n1p4f8pcjpp5ja9gkpl4quyz67ly7mlfz9vlsrthfdaczjmczavw2xt5pg5ptdassp5cy4ud59rgfat6ecljkkcye003vggzqp2psna46uc9xndq4qf2wnsxq9z0rgqnp4qvyndeaqzman7h898jxm98dzkm0mlrsx36s93smrur7h0azyyuxc5rzjqwghf7zxvfkxq5a6sr65g0gdkv768p83mhsnt0msszapamzx2qvuxqqqqrt49lmtcqqqqqqqqqqq86qq9qrzjqwh7ux4q5tehr659rkvdm3qfcfkaq9g6xa2uu0fjc7z879smk7s7rapyqr6zgqqqq8hxk2qqae4jsqyugqcqzpuhp5efjq7qz2nfd6k9y9sumge0ndgdjafeaa3enqpxdvt6xahhck3zts9qyyssqzn5z22zljc7k6lxx6x84r9k968xl3wsehqd25krptusy42wzwxv3pnlaf37qwvdcvn5sta8cqtmdj55ks5nfgg7dpcfgg65mrkdjy8qp38havw";

const PUBLISHED_FIVE_SAT_INVOICE = "lnbc50n1p4f8zv6pp5tp8zcw33p0c8jv0dyxmt8jaf4jv3cska0r54yg5hdgqg7d49rrgshp5v7c9dt2lkfxfahv3pk2hzk2h75mgw663lcdud50e6t948ucg5lmscqzzsxqyz5vqsp5pw0cepqqxcsq3s5zqwkrn7x7njqm3zenl4p75pahdmpu3krng37s9qxpqysgqrz89svvuytkg4ff679rvgxv3dvkhnew2yma0e8ap3ghrpmrr7elnmfy92dr7y8snrg5l702gxjptkk0248apgsghvt32v53hftj0knqqp3qnxs";

const PUBLISHED_ZAP_REQUEST = "{\"kind\":9734,\"created_at\":1788053914,\"content\":\"\",\"tags\":[[\"relays\",\"wss://yabu.me\",\"wss://relay.primal.net\",\"wss://relay.damus.io\",\"wss://nos.lol\"],[\"amount\",\"5000\"],[\"lnurl\",\"LNURL1DP68GURN8GHJ7AMPD3KX2AR0VEEKZAR0WD5XJTNRDAKJ7TNHV4KXCTTTDEHHWM30D3H82UNVWQHHXETPWD5KX6M3W45KCAPKX5YESX8Z\"],[\"p\",\"76de938c1db10fb929709256bbd98b87320139a5352b4f845df042a7558d5b59\"],[\"zap_live\",\"zap-battle-3-beginner\"],[\"zap_live_side\",\"left\"],[\"zap_live_starts_at\",\"1788053895\"],[\"client\",\"zap-battle\"]],\"pubkey\":\"78c77a86095619a71f311835eba4df3b3180b4dada3b73db87e54bf80bf2bee6\",\"id\":\"8e4aea882c747593931aa2bbe31d7c17bdde44ddeb276123ab183e2522c2e9e4\",\"sig\":\"6157cac610efd03b3f172c61093cdb23745a43972ba0258e761c27fa722d70495e29c69b438a7d91d8e10bdad3404409917edf51bde618eaba1fc6d4e2e95919\"}";

test("inspects the WoS invoice whose receipt was not published", () => {
  const details = inspectBolt11Invoice(UNPUBLISHED_ONE_SAT_INVOICE);

  assert.equal(details.amountMsats, 1_000);
  assert.equal(details.createdAt, 1_788_053_266);
  assert.equal(details.descriptionHash, "ca640f004a9a5bab148587368cbe6d4365d4e7bd8e660099ac5e8ddbdf168897");
  assert.equal(details.paymentHash, "974a8b07f507082d7be4f6fe91159f80d774b7b814b781758e519740a2815b7b");
});

test("accepts a real WoS invoice bound to the exact signed Zap request", () => {
  const details = validateZapInvoice({
    amountMsats: 5_000,
    invoice: PUBLISHED_FIVE_SAT_INVOICE,
    zapRequest: PUBLISHED_ZAP_REQUEST
  });

  assert.equal(details.amountMsats, 5_000);
  assert.equal(details.createdAt, 1_788_053_914);
  assert.equal(details.descriptionHash, "67b056ad5fb24c9edd910d95715957f536876b51fe1bc6d1f9d2cb53f308a7f7");
});

test("rejects an invoice for a different amount", () => {
  assert.throws(
    () => validateZapInvoice({
      amountMsats: 6_000,
      invoice: PUBLISHED_FIVE_SAT_INVOICE,
      zapRequest: PUBLISHED_ZAP_REQUEST
    }),
    (error) => error instanceof ZapInvoiceValidationError && error.code === "amount_mismatch"
  );
});

test("rejects an invoice not bound to the exact Zap request", () => {
  assert.throws(
    () => validateZapInvoice({
      amountMsats: 5_000,
      invoice: PUBLISHED_FIVE_SAT_INVOICE,
      zapRequest: `${PUBLISHED_ZAP_REQUEST} `
    }),
    (error) => error instanceof ZapInvoiceValidationError && error.code === "description_hash_mismatch"
  );
});

test("rejects malformed invoices", () => {
  assert.throws(
    () => inspectBolt11Invoice("not-an-invoice"),
    (error) => error instanceof ZapInvoiceValidationError && error.code === "invalid_invoice"
  );
});
