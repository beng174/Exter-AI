import test from "node:test";
import assert from "node:assert/strict";
import { providerConfig } from "../server/connectors/types.js";

const env = {
  EXTER_META_ACCESS_TOKEN: "fixture-token",
  EXTER_META_AD_ACCOUNT_ID: "act_123456",
};

test("Meta account configuration defaults to Graph v25.0 without provider calls", () => {
  assert.equal(providerConfig("Meta", env).apiVersion, "v25.0");
  assert.equal(
    providerConfig("Meta", { ...env, EXTER_META_GRAPH_VERSION: "" }).apiVersion,
    "v25.0",
  );
});

test("Meta account configuration preserves an explicit Graph version", () => {
  assert.equal(
    providerConfig("Meta", { ...env, EXTER_META_GRAPH_VERSION: "v26.0" }).apiVersion,
    "v26.0",
  );
});

test("Meta account configuration rejects malformed Graph versions", () => {
  assert.throws(
    () => providerConfig("Meta", { ...env, EXTER_META_GRAPH_VERSION: "25" }),
    /EXTER_META_GRAPH_VERSION must use the form v25\.0/,
  );
});
