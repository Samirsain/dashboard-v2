import { dataService } from "../src/services/data.service";
import { sheetsConfig } from "../src/config/sheets.config";

async function run() {
  try {
    const users = await dataService.findAll(sheetsConfig.users);
    const adminUsers = users.filter((u) => u["Role"] === "Admin");

    if (adminUsers.length === 0) {
      console.log("No users with role 'Admin' found. They are probably already 'MD'.");
      return;
    }

    console.log(`Found ${adminUsers.length} 'Admin' user(s). Renaming to 'MD'...`);

    for (const admin of adminUsers) {
      const id = admin["Doer ID"];
      const name = admin["Name"];
      
      if (!id) continue;

      await dataService.updateById(sheetsConfig.users, id, {
        Role: "MD",
      });

      console.log(`✅ Renamed ${name} from Admin to MD.`);
    }

    console.log("Migration complete!");
  } catch (err) {
    console.error("Error migrating roles:", err);
  }
}

run();
