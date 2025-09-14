import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { readFileSync } from 'fs';

const CONTAINER_NAME = 'postgres-dev';

export async function importDump(dumpFile: string) {
  console.log(`Starting data import into container '${CONTAINER_NAME}' from file '${dumpFile}'...`);

  // Validation checks
  if (!dumpFile) {
    console.error('Error: You must provide the path to the PostgreSQL dump file.');
    process.exit(1);
  }

  if (!existsSync(dumpFile)) {
    console.error(`Error: The file '${dumpFile}' was not found.`);
    process.exit(1);
  }

  // Check if the Docker container is running
  try {
    execSync(`docker ps | grep -q ${CONTAINER_NAME}`, { stdio: 'pipe' });
  } catch {
    console.error(`Error: The '${CONTAINER_NAME}' container is not running.`);
    console.error('Please start it first using the "sorter-db run-postgres" command.');
    process.exit(1);
  }

  let importSuccess = false;

  try {
    // Check if file is binary or text by looking at first bytes
    const firstBytes = readFileSync(dumpFile, { encoding: 'binary' }).substring(0, 5);
    
    if (firstBytes === 'PGDMP') {
      console.log('Importing data from binary dump...');
      
      try {
        // For binary dumps, attempt to use pg_restore with proper error handling
        execSync(
          `docker exec -i -e PGPASSWORD=password ${CONTAINER_NAME} pg_restore -U postgres -d postgres --clean --if-exists < "${dumpFile}"`,
          { stdio: 'inherit' }
        );
        console.log('Binary dump import successful.');
        importSuccess = true;
      } catch (error) {
        console.error('ERROR: pg_restore failed. This could be due to version incompatibility.');
        console.error('Attempting alternative restore method with --no-owner and --no-acl flags...');
        
        try {
          // Try with --no-owner and --no-acl flags which can help with version compatibility
          execSync(
            `docker exec -i -e PGPASSWORD=password ${CONTAINER_NAME} pg_restore --no-owner --no-acl -U postgres -d postgres --clean --if-exists < "${dumpFile}"`,
            { stdio: 'inherit' }
          );
          console.log('Alternative restore method successful.');
          importSuccess = true;
        } catch (secondError) {
          console.error('ERROR: All restore methods failed. Unable to import the binary dump file.');
        }
      }
    } else {
      console.log('Importing data from SQL text dump...');
      // Use psql for text dumps
      console.log('Starting SQL import transaction...');
      
      try {
        execSync(
          `cat "${dumpFile}" | docker exec -i -e PGPASSWORD=password ${CONTAINER_NAME} psql -U postgres -d postgres -v ON_ERROR_STOP=1`,
          { stdio: 'inherit' }
        );
        console.log('SQL data import successful.');
        importSuccess = true;
      } catch (error) {
        console.error('ERROR: psql command failed. The transaction was automatically rolled back.');
        console.error('Please check your SQL dump file for errors.');
      }
    }
  } catch (error) {
    console.error('Error during import process:', error);
  }

  // Final status
  if (importSuccess) {
    console.log('Data import completed successfully.');
  } else {
    console.error('Data import failed. The database may contain incomplete data or be unchanged.');
    process.exit(1);
  }
}
