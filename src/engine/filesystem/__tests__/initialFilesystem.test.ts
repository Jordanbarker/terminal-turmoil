import { describe, it, expect } from "vitest";
import { createFilesystem } from "../initialFilesystem";
import { VirtualFS } from "../VirtualFS";

const USERNAME = "testplayer";

function makeFS(): VirtualFS {
  const root = createFilesystem(USERNAME);
  return new VirtualFS(root, `/home/${USERNAME}`, `/home/${USERNAME}`);
}

describe("createFilesystem", () => {
  const fs = makeFS();

  describe("top-level structure", () => {
    it("has /home directory", () => {
      expect(fs.getNode("/home")?.type).toBe("directory");
    });

    it("has /var directory", () => {
      expect(fs.getNode("/var")?.type).toBe("directory");
    });

    it("has /etc directory", () => {
      expect(fs.getNode("/etc")?.type).toBe("directory");
    });

    it("has /opt directory", () => {
      expect(fs.getNode("/opt")?.type).toBe("directory");
    });

    it("has /tmp directory", () => {
      expect(fs.getNode("/tmp")?.type).toBe("directory");
    });

    it("has /srv directory", () => {
      expect(fs.getNode("/srv")?.type).toBe("directory");
    });
  });

  describe("user home directory", () => {
    it("creates /home/<username>", () => {
      expect(fs.getNode(`/home/${USERNAME}`)?.type).toBe("directory");
    });

    it("has .bashrc (hidden)", () => {
      const node = fs.getNode(`/home/${USERNAME}/.bashrc`);
      expect(node?.type).toBe("file");
      expect(node?.hidden).toBe(true);
    });

    it("has welcome.txt", () => {
      const result = fs.readFile(`/home/${USERNAME}/welcome.txt`);
      expect(result.content).toContain("Welcome to NexaCorp");
    });

    it("has Documents directory", () => {
      expect(fs.getNode(`/home/${USERNAME}/Documents`)?.type).toBe("directory");
    });

    it("has scripts directory with hello.py", () => {
      const result = fs.readFile(`/home/${USERNAME}/scripts/hello.py`);
      expect(result.content).toContain("Hello from NexaCorp");
    });
  });

  describe("jchen home directory", () => {
    it("has /home/jchen", () => {
      expect(fs.getNode("/home/jchen")?.type).toBe("directory");
    });

    it("has resignation_draft.txt", () => {
      const result = fs.readFile("/home/jchen/resignation_draft.txt");
      expect(result.content).toContain("chip_service_account");
    });

    it("has .bash_history", () => {
      const node = fs.getNode("/home/jchen/.bash_history");
      expect(node?.type).toBe("file");
      expect(node?.hidden).toBe(true);
    });

    it("has .private directory with evidence.txt", () => {
      const result = fs.readFile("/home/jchen/.private/evidence.txt");
      expect(result.content).toContain("ENCRYPTED");
    });
  });

  describe("system directories", () => {
    it("has /var/log with system.log", () => {
      const result = fs.readFile("/var/log/system.log");
      expect(result.content).toContain("System boot");
    });

    it("has /var/log with chip-activity.log", () => {
      const result = fs.readFile("/var/log/chip-activity.log");
      expect(result.content).toContain("Chip service started");
    });

    it("has /etc/hostname", () => {
      const result = fs.readFile("/etc/hostname");
      expect(result.content).toContain("nexacorp-ws01");
    });

    it("has /opt/chip with README.md", () => {
      const result = fs.readFile("/opt/chip/README.md");
      expect(result.content).toContain("Collaborative Helper");
    });

    it("has /opt/chip/config/settings.json", () => {
      const result = fs.readFile("/opt/chip/config/settings.json");
      expect(result.content).toContain('"name": "Chip"');
    });
  });

  describe("username interpolation", () => {
    it("interpolates username in system.log", () => {
      const result = fs.readFile("/var/log/system.log");
      expect(result.content).toContain(USERNAME);
    });

    it("interpolates username in chip-activity.log", () => {
      const result = fs.readFile("/var/log/chip-activity.log");
      expect(result.content).toContain(USERNAME);
    });

    it("interpolates username in onboarding.md", () => {
      const result = fs.readFile(`/home/${USERNAME}/Documents/onboarding.md`);
      expect(result.content).toContain(`/home/${USERNAME}`);
    });

    it("works with a different username", () => {
      const root2 = createFilesystem("alice");
      const fs2 = new VirtualFS(root2, "/home/alice", "/home/alice");
      expect(fs2.getNode("/home/alice")?.type).toBe("directory");
      const result = fs2.readFile("/var/log/system.log");
      expect(result.content).toContain("alice");
    });
  });

  describe("mail seeding", () => {
    it("has /var/mail/<username>/new with initial emails", () => {
      const mailNew = fs.getNode(`/var/mail/${USERNAME}/new`);
      expect(mailNew?.type).toBe("directory");
      if (mailNew?.type === "directory") {
        const fileCount = Object.keys(mailNew.children).length;
        expect(fileCount).toBeGreaterThanOrEqual(3);
      }
    });

    it("has /var/mail/<username>/cur (empty)", () => {
      const mailCur = fs.getNode(`/var/mail/${USERNAME}/cur`);
      expect(mailCur?.type).toBe("directory");
      if (mailCur?.type === "directory") {
        expect(Object.keys(mailCur.children)).toHaveLength(0);
      }
    });

    it("has /var/mail/<username>/sent (empty)", () => {
      const mailSent = fs.getNode(`/var/mail/${USERNAME}/sent`);
      expect(mailSent?.type).toBe("directory");
      if (mailSent?.type === "directory") {
        expect(Object.keys(mailSent.children)).toHaveLength(0);
      }
    });

    it("mail files contain email headers", () => {
      const mailNew = fs.getNode(`/var/mail/${USERNAME}/new`);
      if (mailNew?.type === "directory") {
        const firstFile = Object.values(mailNew.children)[0];
        if (firstFile?.type === "file") {
          expect(firstFile.content).toContain("From:");
          expect(firstFile.content).toContain("To:");
          expect(firstFile.content).toContain("Subject:");
        }
      }
    });
  });

  describe("handoff directory", () => {
    it("has /srv/engineering/chen-handoff with README.md", () => {
      const result = fs.readFile(`/srv/engineering/chen-handoff/README.md`);
      expect(result.content).toContain("Jin");
    });

    it("has /srv/engineering/chen-handoff with notes.txt", () => {
      const result = fs.readFile(`/srv/engineering/chen-handoff/notes.txt`);
      expect(result.content).toContain("chip-activity.log");
    });
  });
});
