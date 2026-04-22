/**
 * ✅ Correct: Using createInject + Inject for service wiring.
 *
 * This pattern separates container registration (once) from
 * service consumption (many classes), keeping services decoupled
 * from the container setup.
 */
import { Teleportability, createInject } from "@ecosy/classable";

// --- Define interfaces for loose coupling ---

interface ConfigLike {
  readonly dbUrl: string;
  readonly cacheEnabled: boolean;
}

interface DatabaseLike {
  query(sql: string): Promise<unknown[]>;
}

interface LoggerLike {
  log(message: string): void;
  error(message: string, err?: unknown): void;
}

// --- Container setup (once, in a dedicated file) ---

class Config implements ConfigLike {
  readonly dbUrl = "postgres://localhost/app";
  readonly cacheEnabled = true;
}

class Database implements DatabaseLike {
  async query(sql: string) { return []; }
}

class Logger implements LoggerLike {
  log(msg: string) { console.log(msg); }
  error(msg: string, err?: unknown) { console.error(msg, err); }
}

const AppContainer = Teleportability({
  key: Symbol.for("myapp:container"),
  injects: { config: Config, db: Database, logger: Logger },
});

const Inject = createInject(() => AppContainer);

// --- Services use Inject in constructor defaults ---

class UserRepository {
  constructor(
    private readonly db = Inject<DatabaseLike>("db"),
    private readonly logger = Inject<LoggerLike>("logger"),
  ) {}

  async findById(id: string) {
    this.logger.log(`UserRepository.findById(${id})`);
    const [user] = await this.db.query(`SELECT * FROM users WHERE id = '${id}'`);
    return user;
  }
}

class UserService {
  constructor(
    private readonly config = Inject<ConfigLike>("config"),
    private readonly logger = Inject<LoggerLike>("logger"),
  ) {}

  async getUser(id: string) {
    this.logger.log(`UserService.getUser(${id}), cache=${this.config.cacheEnabled}`);
    const repo = new UserRepository(); // Inject resolves db + logger automatically
    return repo.findById(id);
  }
}

// --- Usage ---

const service = new UserService();
await service.getUser("123");

// Cleanup
AppContainer.dispose();
