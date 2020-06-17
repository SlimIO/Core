import test from "@slimio/unit-testing";
import { strict as assert } from "assert";

test("plan 1 must be ok", (curr) => {
    curr.plan(1);
    curr.pass();
});
