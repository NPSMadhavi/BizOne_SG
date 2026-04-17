import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import companiesRouter from "./companies";
import purchaseOrdersRouter from "./purchase-orders";
import quotationsRouter from "./quotations";
import invoicesRouter from "./invoices";
import deliveryOrdersRouter from "./delivery-orders";
import settingsRouter from "./settings";
import emailRouter from "./email";
import contactsRouter from "./contacts";
import grnRouter from "./grn";
import stockItemsRouter from "./stock-items";
import vendorsRouter from "./vendors";
import customersRouter from "./customers";
import emailContactsRouter from "./email-contacts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(companiesRouter);
router.use(purchaseOrdersRouter);
router.use(quotationsRouter);
router.use(invoicesRouter);
router.use(deliveryOrdersRouter);
router.use("/settings", settingsRouter);
router.use(emailRouter);
router.use(contactsRouter);
router.use(grnRouter);
router.use(stockItemsRouter);
router.use(vendorsRouter);
router.use(customersRouter);
router.use(emailContactsRouter);

export default router;
