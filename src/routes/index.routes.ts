import { Router } from "express";
import { healthCheck, welcome } from "../controller/index.controller.js";
import authRouter from "./auth.routes.js";
import userRouter from "./user.routes.js";
import authenticateUser from "../middleware/auth.middleware.js";
import companyRouter from "./company.routes.js";
import departmentRouter from "./department.route.js";
import branchRouter from "./branch.routes.js";
import subscriptionRouter from "./subscription.routes.js";
import settingRouter from "./setting.routes.js";
import authorizeCompanyAccess from "../middleware/company/authorizeCompanyAccess.middleware.js";
import requireModuleAccess from "../middleware/subscription/requireModuleAccess.middleware.js";
import authorizeRoles from "../middleware/rbac/authorizeRoles.middleware.js";
import adminSubscriptionRouter from "./adminSubscription.routes.js";
import studentRouter from "./student.routes.js";
import STUDENT_CONTROLLER from "../controller/student.controller.js";
import validateInput from "../middleware/inputValidator.middleware.js";
import { studentSignupSchema } from "../schemas/student/student.schema.js";
import instructorRouter from "./instructor.routes.js";

const indexRouter = Router();

indexRouter.get("/", welcome);
indexRouter.get("/health", healthCheck);
indexRouter.use("/auth", authRouter);
indexRouter.use("/user", authenticateUser, userRouter);
indexRouter.use("/company", authenticateUser, companyRouter);
indexRouter.use("/department", authenticateUser, authorizeCompanyAccess, departmentRouter);
indexRouter.use("/settings", authenticateUser, authorizeCompanyAccess, settingRouter);
indexRouter.use("/subscription", authenticateUser, subscriptionRouter);
indexRouter.use("/admin/subscriptions", authenticateUser, authorizeRoles("SUPER_ADMIN"), adminSubscriptionRouter);
indexRouter.use("/branch", authenticateUser, authorizeCompanyAccess, branchRouter);
indexRouter.post("/students/signup", validateInput(studentSignupSchema), STUDENT_CONTROLLER.signup);
indexRouter.use("/students", authenticateUser, authorizeCompanyAccess, studentRouter);
indexRouter.use("/student", authenticateUser, studentRouter);
indexRouter.use("/instructors", authenticateUser, authorizeCompanyAccess, instructorRouter);
indexRouter.use("/instructor", authenticateUser, instructorRouter);


export default indexRouter;
