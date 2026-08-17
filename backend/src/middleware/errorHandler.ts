import type { ErrorRequestHandler } from "express";

// The last piece of middleware in the chain (see app.ts) - Express recognizes it as an *error*
// handler specifically because it declares four parameters (err, req, res, next), not three.
// Every route in this app already handles its own *expected* failure cases explicitly (a
// wrong password, a not-found id, a validation error) with its own status code and JSON body -
// this only ever runs for something genuinely unexpected slipping through (a database
// connection blip, a bug), which none of those per-route try/catches were written to handle.
//
// Express 5 (this project's version) automatically forwards a rejected Promise from an async
// route handler to error-handling middleware like this one - in Express 4, that required each
// route to catch its own errors and call next(err) manually. Without *any* error-handling
// middleware registered, an error like this falls through to Express's own built-in default
// handler, which renders an HTML page - completely inconsistent with every other response this
// API ever sends, and something like `apiFetch`'s `res.json()` call on the frontend would fail
// to parse entirely.
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  // A response can only be sent once - if something downstream already started writing one
  // (rare, but possible with streaming responses) there's nothing safe left to do but hand off
  // to Express's own default handler, which knows how to cope with that state correctly.
  if (res.headersSent) {
    next(err);
    return;
  }

  // Logged here, server-side only - this is exactly the "stack trace" Tasks.md's Phase 3 item
  // says must never leak into an HTTP response, but it's genuinely useful for whoever's
  // actually diagnosing the failure from the server's own logs.
  console.error(err);

  res.status(500).json({
    error: { message: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" },
  });
};
