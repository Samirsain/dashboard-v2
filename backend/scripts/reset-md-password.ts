import { dataService } from "../src/services/data.service";
import { sheetsConfig } from "../src/config/sheets.config";
import bcrypt from "bcryptjs";

async function run() {
  try {
    const users = await dataService.findAll(sheetsConfig.users);
    const mdUsers = users.filter((u) => u["Role"] === "Admin" || u["Role"] === "MD");

    if (mdUsers.length === 0) {
      console.log("No MD or Admin users found in the database.");
      return;
    }

    console.log(`Found ${mdUsers.length} MD user(s).`);

    const newPassword = "password123";
    const passwordHash = await bcrypt.hash(newPassword, 10);

    for (const md of mdUsers) {
      const id = md["Doer ID"];
      const code = md["Employee Code"];
      const name = md["Name"];
      
      if (!id) continue;

      await dataService.updateById(sheetsConfig.users, id, {
        PasswordHash: passwordHash,
      });

      console.log(`\n✅ Reset password for MD User:`);
      console.log(`Name: ${name}`);
      console.log(`Login ID (Employee Code): ${code || "No code found!"}`);
      console.log(`New Password: ${newPassword}`);
    }
  } catch (err) {
    console.error("Error updating password:", err);
  }
}

run();
