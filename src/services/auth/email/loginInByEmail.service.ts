import { Request } from "express";
import { AppError } from "../../../types/AppError.js";
import AUTH_SERVICE from "../index.service.js";
import buildLoginAccess from "./buildLoginAccess.service.js";
import { getDeviceInfoAndIp } from "../../../utils/deviceInfo.util.js";
import prisma from "../../../database/index.db.js";

export async function loginByEmail(email: string, password: string, req?: Request) {
  const user = await AUTH_SERVICE.PASSWORD.validateUserPassword(
    email,
    password,
  );

  if (user.isEmailVerified === false) {
    throw new AppError("Email not verified", 400);
  }

  if (user.userRole === "INSTRUCTOR") {
    const profile = await prisma.instructorProfile.findFirst({ where: { userId: user.id, companyId: user.companyId ?? "", deletedAt: null } });
    if (profile?.status !== "ACTIVE") throw new AppError("Instructor account is not active", 403);
  }

  const refreshToken = await AUTH_SERVICE.REFRESH_TOKEN.generateRefreshToken({
    user_id: user.id,
  });


  const accessToken = AUTH_SERVICE.ACCESS_TOKEN.generateAccessToken({
    user_id: user.id,
    company_id: user.companyId ?? undefined,
    rftoken_id: refreshToken.rftoken_id,
  });

  // Subscription & module-access snapshot for the dynamic sidebar.
  const access = await buildLoginAccess(user.companyId, user.userRole);

  const { ipAddress, deviceName } = getDeviceInfoAndIp(req);

  return {
    user: {
      id: user.id,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
      companyId: user.companyId,
      userRole: user.userRole,
      createdAt: user.createdAt,
      mustChangePassword: user.mustChangePassword,
    },
    accessToken: accessToken,
    refreshToken: refreshToken.refreshToken,
    companyId: user.companyId,
    ipAddress,
    deviceName,
    subscription: access?.subscription ?? null,
    enabledModules: access?.enabledModules ?? [],
    navigation: access?.navigation ?? null,
  };
}
