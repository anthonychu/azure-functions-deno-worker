import {
  assertEquals,
  assertStringContains
} from "https://deno.land/std@0.67.0/testing/asserts.ts";

Deno.test("hello_world HTTP trigger works", async () => {
  const baseUrl = Deno.env.get("FUNCTION_APP_BASE_URL") ?? "http://localhost:7071"
  const resp = await fetch(`${baseUrl}/api/hello_world`);
  const data = await resp.text();
  assertStringContains(data, "Azure Functions");
});
