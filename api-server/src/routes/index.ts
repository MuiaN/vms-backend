import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import vehiclesRouter from "./vehicles";
import distributorsRouter from "./distributors";
import usersRouter from "./users";
import pricingRouter from "./pricing";
import categoryPricingRouter from "./category-pricing";
import ordersRouter from "./orders";
import documentsRouter from "./documents";
import invoicesRouter from "./invoices";
import subscriptionsRouter from "./subscriptions";
import trackingRouter from "./tracking";
import newsRouter from "./news";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(vehiclesRouter);
router.use(distributorsRouter);
router.use(usersRouter);
router.use(pricingRouter);
router.use(categoryPricingRouter);
router.use(ordersRouter);
router.use(documentsRouter);
router.use(invoicesRouter);
router.use(subscriptionsRouter);
router.use(trackingRouter);
router.use(newsRouter);

export default router;
