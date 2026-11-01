import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import sftApp from "../legacy-server";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
// Accept dataset files without treating their contents as request JSON fields.
app.post("/api/finetune/upload", express.raw({ type: "multipart/form-data", limit: "50mb" }), async (req, res, next) => {
  if (!req.is("multipart/form-data")) return next();
  try {
    const form = await new Response(new Uint8Array(req.body), {
      headers: { "Content-Type": req.get("content-type")! },
    }).formData();
    const training = form.get("trainingFile");
    const validation = form.get("validationFile");
    if (!training || typeof training === "string" || !validation || typeof validation === "string") {
      res.status(400).json({ success: false, error: "Both training and validation files are required." });
      return;
    }
    req.body = {
      trainingJsonl: await training.text(),
      validationJsonl: await validation.text(),
      trainingModel: form.get("trainingModel"),
      suffix: form.get("suffix"),
      confirmUpload: form.get("confirmUpload") === "true",
    };
    next();
  } catch {
    res.status(400).json({ success: false, error: "Could not read the uploaded dataset files." });
  }
});
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);
app.use("/api", router);
app.use(sftApp);

export default app;
