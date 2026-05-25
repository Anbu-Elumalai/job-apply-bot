import "reflect-metadata";
import * as dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcryptjs";
import { AppDataSource } from "../data-source";

import { AdminUser } from "../entity/AdminUser";
import { Role } from "../entity/Role.Permission";
import { UserProfile } from "../entity/UserProfile";
import { PlatformCredential } from "../entity/PlatformCredential";
import { EncryptionService } from "../services/encryption.service";

export async function seedAdmin() {
  const roleRepo = AppDataSource.getMongoRepository(Role);
  const userRepo = AppDataSource.getMongoRepository(AdminUser);
  const profileRepo = AppDataSource.getMongoRepository(UserProfile);
  const credentialRepo = AppDataSource.getMongoRepository(PlatformCredential);

  const modules = [
    "dashboard",
    "roles_permissions",
    "user_profiles",
    "job_posts",
    "job_applications",
    "telemetry"
  ];

  const actions = ["view", "create", "edit", "delete"];

  const fullPermissions = modules.map((module) => ({
    moduleId: module,
    actions
  }));

  // ✅ ROLE
  let adminRole = await roleRepo.findOne({
    where: { code: "SUPER_ADMIN" }
  });

  if (!adminRole) {
    adminRole = roleRepo.create({
      name: "Super Admin",
      code: "SUPER_ADMIN",
      isActive: true,
      isDeleted: false,
      permissions: fullPermissions
    });

    adminRole = await roleRepo.save(adminRole);
  }

  // ✅ USER
  let adminUser = await userRepo.findOne({
    where: { phoneNumber: "9999999999" }
  });

  if (!adminUser) {
    const hashedPin = await bcrypt.hash("1234", 10);

    adminUser = userRepo.create({
      name: "Super Admin",
      email: "admin@test.com",
      phoneNumber: "9999999999",
      pin: hashedPin,
      userId: "USR001",
      roleId: adminRole._id,
      createdBy: adminRole._id,
      updatedBy: adminRole._id,
      isActive: true,
      isDeleted: false
    });

    await userRepo.save(adminUser);
  }

  // ✅ USER PROFILE (Job Candidate)
  let candidateProfile = await profileRepo.findOne({
    where: { email: "admin@test.com" }
  });

  if (!candidateProfile) {
    candidateProfile = profileRepo.create({
      name: "Super Admin Candidate",
      email: "admin@test.com",
      phoneNumber: "9999999999",
      currentTitle: "Senior Backend Developer",
      skills: ["Node.js", "TypeScript", "Express", "MongoDB", "TypeORM", "JavaScript", "Docker", "REST API"],
      totalExperienceYears: 6,
      preferences: {
        jobTitles: ["Senior Backend Engineer", "Senior Node.js Developer", "Backend Architect"],
        locations: ["Bangalore", "Remote", "Chennai"],
        jobTypes: ["Remote", "Hybrid"],
        salaryExpectationMin: 1800000,
        salaryExpectationCurrency: "INR",
        matchingThresholdScore: 70,
        autoApply: true
      },
      resumeUrl: "/public/uploads/sample_resume.pdf",
      coverLetterTemplate: "Hi {{companyName}} Hiring Team,\n\nI am writing to express my strong interest in the {{jobTitle}} position at your company. With {{totalExperienceYears}} years of backend software engineering experience, I specialize in building scalable web APIs and services using {{skills}}.\n\nI look forward to discussing my application further.\n\nBest regards,\n{{name}}"
    });

    await profileRepo.save(candidateProfile);
  }

  // ✅ MOCK PLATFORM CREDENTIALS FOR TESTING
  let linkedInCred = await credentialRepo.findOne({
    where: { platform: "linkedin" }
  });

  if (!linkedInCred) {
    const encrypted = EncryptionService.encrypt("linkedin-secret-password-123");
    linkedInCred = credentialRepo.create({
      platform: "linkedin",
      username: "candidate@linkedin.com",
      encryptedPassword: encrypted.encryptedData,
      encryptionIv: encrypted.iv,
      cookies: [
        { name: "li_at", value: "ajax_session_mock_cookie_hash_val_44211", domain: ".linkedin.com" }
      ],
      isActive: true
    });

    await credentialRepo.save(linkedInCred);
  }

  console.log("✅ Seed Completed Successfully");
}
