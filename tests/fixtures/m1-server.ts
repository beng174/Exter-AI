import { BrandLogoStore } from "../../server/brand-logos.js";
import express from "express";
import { resolve } from "node:path";
import { openDatabase } from "../../server/db.js";
import { createApp } from "../../server/app.js";
const db = openDatabase(":memory:", false);
const app = createApp(db);
// The preview never retrieves live website icons.
app.locals.brandLogos = new BrandLogoStore({root:"work/alignment-fixture-media",fetch:async()=>{throw new Error("Fixture preview has no website transport.");},resolve:async()=>[{address:"93.184.215.14",family:4}]});
app.use(express.static(resolve("dist")));
app.get("/{*path}", (_req,res)=>res.sendFile(resolve("dist/index.html")));
app.listen(3118,"127.0.0.1",()=>console.log("Retained capture preview ready; no provider calls"));
