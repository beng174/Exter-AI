import express from "express";
import { resolve } from "node:path";
import { openDatabase } from "../../server/db.js";
import { createApp } from "../../server/app.js";
const db = openDatabase(":memory:", false);
const app = createApp(db);
app.use(express.static(resolve("dist")));
app.get("/{*path}", (_req,res)=>res.sendFile(resolve("dist/index.html")));
app.listen(3118,"127.0.0.1",()=>console.log("Retained capture preview ready; no provider calls"));
