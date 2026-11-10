import express from "express";
import { resolve } from "node:path";
import { openDatabase } from "../../server/db.js";
import { createApp } from "../../server/app.js";
import { BrandLogoStore } from "../../server/brand-logos.js";
const app=createApp(openDatabase(":memory:",false));
app.locals.brandLogos=new BrandLogoStore({root:"work/accuracy-fixture-media",fetch:async()=>{throw new Error("Fixture server has no provider transport.");},resolve:async()=>[]});
app.use(express.static(resolve("dist")));app.get("/{*path}",(_req,res)=>res.sendFile(resolve("dist/index.html")));
app.listen(3127,"127.0.0.1",()=>process.stdout.write("Accuracy fixture preview on 3127. No provider calls.\n"));
