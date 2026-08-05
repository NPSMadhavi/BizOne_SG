import { Router, type IRouter } from "express";
import warehousesRouter from "./warehouses";
import transactionsRouter from "./transactions";

const router: IRouter = Router();

router.use(warehousesRouter);
router.use(transactionsRouter);

export default router;
