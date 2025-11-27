import express from "express";
import cors from "cors";
import path from "path";

import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(
    cors({
        origin: "*",
    })
);
// parse request body as JSON
app.use(express.json({ limit: "50mb" }));
// add access to directory
app.use(express.static(__dirname));

app.post("/v1/getFile", (req, res) => {
    res.json({ status: "Success" });
});


//Start the server
const server = app.listen(process.env.PORT || port, function () {
    const host = server.address().address;
    const port = server.address().port;
    console.log("Great, app is listening at http://%s:%s", host, port);
});
