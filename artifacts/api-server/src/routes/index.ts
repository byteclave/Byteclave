import { Router, type IRouter } from "express";
import contentRouters from "./content";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
for (const contentRouter of contentRouters) {
  router.use(contentRouter);
}

export default router;
