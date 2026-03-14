import { describe, it, expect } from "vitest";
import { classifyModule } from "../src/parser/module-classifier.js";

describe("module-classifier", () => {
  describe("Go patterns", () => {
    it("classifies services directory", () => {
      expect(classifyModule("internal/services/user.go")).toBe("service");
    });

    it("classifies pkg/utils as util", () => {
      expect(classifyModule("pkg/utils/hash.go")).toBe("util");
    });

    it("classifies config directory", () => {
      expect(classifyModule("internal/config/db.go")).toBe("config");
    });

    it("classifies store directory", () => {
      expect(classifyModule("internal/store/cache.go")).toBe("store");
    });
  });

  describe("Rust patterns", () => {
    it("classifies handler files", () => {
      expect(classifyModule("src/handlers/api_handler.rs")).toBe("handler");
    });

    it("classifies db directory as repository", () => {
      expect(classifyModule("src/db/user_repo.rs")).toBe("repository");
    });

    it("classifies service files", () => {
      expect(classifyModule("src/services/auth_service.rs")).toBe("service");
    });

    it("classifies model files", () => {
      expect(classifyModule("src/models/user_model.rs")).toBe("model");
    });
  });

  describe("PHP patterns", () => {
    it("classifies service files", () => {
      expect(classifyModule("app/Services/PaymentService.php")).toBe("service");
    });

    it("classifies middleware files", () => {
      expect(classifyModule("app/Middleware/Auth.php")).toBe("middleware");
    });

    it("classifies migration files", () => {
      expect(classifyModule("database/migrations/001_create_users.php")).toBe(
        "migration",
      );
    });

    it("classifies request files as validator", () => {
      expect(classifyModule("app/Requests/StoreUserRequest.php")).toBe(
        "validator",
      );
    });
  });

  describe("Ruby patterns", () => {
    it("classifies service files", () => {
      expect(classifyModule("app/services/payment_service.rb")).toBe("service");
    });

    it("classifies job files as service", () => {
      expect(classifyModule("app/jobs/send_email_job.rb")).toBe("service");
    });

    it("classifies mailer files as service", () => {
      expect(classifyModule("app/mailers/user_mailer.rb")).toBe("service");
    });

    it("classifies serializer files", () => {
      expect(classifyModule("app/serializers/user_serializer.rb")).toBe(
        "serializer",
      );
    });

    it("classifies validator files", () => {
      expect(classifyModule("app/validators/email_validator.rb")).toBe(
        "validator",
      );
    });
  });

  describe("schema and database directory patterns", () => {
    it("classifies /schemas/ directory as schema", () => {
      expect(classifyModule("src/schemas/user.ts")).toBe("schema");
    });

    it("classifies /schema/ directory as schema", () => {
      expect(classifyModule("src/schema/order.ts")).toBe("schema");
    });

    it("classifies /db/ directory as repository", () => {
      expect(classifyModule("src/db/connection.ts")).toBe("repository");
    });

    it("classifies /database/ directory as repository", () => {
      expect(classifyModule("src/database/queries.ts")).toBe("repository");
    });

    it("migration rule takes precedence over db directory", () => {
      expect(classifyModule("database/migrations/001_create.php")).toBe(
        "migration",
      );
    });
  });

  describe("existing JS/TS classifications unchanged", () => {
    it("classifies controller files", () => {
      expect(classifyModule("src/users.controller.ts")).toBe("controller");
    });

    it("classifies service files", () => {
      expect(classifyModule("src/users.service.ts")).toBe("service");
    });

    it("classifies test files", () => {
      expect(classifyModule("src/users.test.ts")).toBe("test");
    });

    it("classifies hook files", () => {
      expect(classifyModule("src/hooks/useAuth.ts")).toBe("hook");
    });
  });
});
