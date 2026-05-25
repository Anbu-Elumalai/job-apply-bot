import {
  JsonController,
  Get,
  Put,
  Post,
  Body,
  UseBefore,
  HttpCode,
  Res
} from "routing-controllers";
import { AppDataSource } from "../../data-source";
import { UserProfile } from "../../entity/UserProfile";
import { PlatformCredential } from "../../entity/PlatformCredential";
import { UserProfileDto, UpdatePlatformCredentialDto } from "../../dto/admin/UserProfile.dto";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import { EncryptionService } from "../../services/encryption.service";
import { StatusCodes } from "http-status-codes";
import handleErrorResponse from "../../utils/commonFunction";

@JsonController("/user-profile")
@UseBefore(AuthMiddleware)
export class UserProfileController {

  @Get("/")
  @HttpCode(StatusCodes.OK)
  async getProfile(@Res() res: any) {
    try {
      const profileRepo = AppDataSource.getMongoRepository(UserProfile);
      let profile = await profileRepo.findOne({});

      if (!profile) {
        // Create an empty profile by default to prevent null returns
        profile = profileRepo.create({
          name: "New Candidate",
          email: "candidate@test.com",
          phoneNumber: "+1234567890",
          currentTitle: "Full Stack Engineer",
          skills: [],
          totalExperienceYears: 0,
          preferences: {
            jobTitles: [],
            locations: [],
            jobTypes: ["Remote"],
            salaryExpectationMin: 0,
            salaryExpectationCurrency: "USD",
            matchingThresholdScore: 75
          },
          resumeUrl: ""
        });
        await profileRepo.save(profile);
      }

      return res.status(StatusCodes.OK).json({
        success: true,
        data: profile
      });
    } catch (err: any) {
      return handleErrorResponse(err, res);
    }
  }

  @Put("/")
  @HttpCode(StatusCodes.OK)
  async updateProfile(@Body() body: UserProfileDto, @Res() res: any) {
    try {
      const profileRepo = AppDataSource.getMongoRepository(UserProfile);
      let profile = await profileRepo.findOne({});

      if (!profile) {
        profile = profileRepo.create(body);
      } else {
        Object.assign(profile, body);
      }

      const saved = await profileRepo.save(profile);
      return res.status(StatusCodes.OK).json({
        success: true,
        message: "Profile updated successfully",
        data: saved
      });
    } catch (err: any) {
      return handleErrorResponse(err, res);
    }
  }

  @Post("/credentials")
  @HttpCode(StatusCodes.OK)
  async updateCredentials(@Body() body: UpdatePlatformCredentialDto, @Res() res: any) {
    try {
      const credentialRepo = AppDataSource.getMongoRepository(PlatformCredential);

      let cred = await credentialRepo.findOne({
        where: { platform: body.platform }
      });

      // Encrypt the password using AES-256-GCM
      const encrypted = EncryptionService.encrypt(body.password);

      if (!cred) {
        cred = credentialRepo.create({
          platform: body.platform,
          username: body.username,
          encryptedPassword: encrypted.encryptedData,
          encryptionIv: encrypted.iv,
          cookies: body.cookies || [],
          isActive: true
        });
      } else {
        cred.username = body.username;
        cred.encryptedPassword = encrypted.encryptedData;
        cred.encryptionIv = encrypted.iv;
        if (body.cookies) {
          cred.cookies = body.cookies;
        }
      }

      await credentialRepo.save(cred);

      return res.status(StatusCodes.OK).json({
        success: true,
        message: `${body.platform.toUpperCase()} credentials stored and encrypted successfully.`
      });
    } catch (err: any) {
      return handleErrorResponse(err, res);
    }
  }
}
