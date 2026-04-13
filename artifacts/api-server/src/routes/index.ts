import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import purchaseOrdersRouter from "./purchase-orders";
import quotationsRouter from "./quotations";
import invoicesRouter from "./invoices";
import deliveryOrdersRouter from "./delivery-orders";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(purchaseOrdersRouter);
router.use(quotationsRouter);
router.use(invoicesRouter);
router.use(deliveryOrdersRouter);
router.use("/settings", settingsRouter);

export default router;
