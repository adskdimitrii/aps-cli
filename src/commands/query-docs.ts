import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveDocsRoot(): string {
  const normalised = __dirname.replace(/\\/g, '/');
  if (normalised.includes('/dist/')) {
    // Prod: running from dist/commands/ → ../docs/aecdatamodel
    return path.join(__dirname, '../docs/aecdatamodel');
  }
  // Dev: running from src/commands/ → ../../docs/aecdatamodel
  return path.join(__dirname, '../../docs/aecdatamodel');
}

const categories: Record<string, { title: string; links: [string, string][] }> = {
  'getting-started': {
    title: 'Getting Started',
    links: [
      ['Get Hubs', 'how-to-docs/tutorial01-gethubs.md'],
      ['Get Projects', 'how-to-docs/tutorial01-getprojects.md'],
      ['Navigate to ElementGroups within a Project', 'how-to-docs/tutorial01-nav-elements.md'],
      ['Get Elements from a Category', 'how-to-docs/tutorial01-elementsbycategory.md'],
    ],
  },
  'advanced-queries': {
    title: 'Working with Advanced Queries',
    links: [
      ['Get ElementGroups Based on Metadata', 'how-to-docs/tutorial02-task1a.md'],
      ['Get Versions of a ElementGroup', 'how-to-docs/tutorial02-task2a.md'],
      ['Get Element Instances of a Particular Type', 'how-to-docs/tutorial02-task3a.md'],
      ['Get Element Instances in a Category by Version', 'how-to-docs/tutorial02-task4a.md'],
      ['Get Project Elements with specific Properties', 'how-to-docs/tutorial02-task5a.md'],
      ['Get Elements by Using Instances or Reference', 'how-to-docs/tutorial02-task6a.md'],
      ['Get Distinct Values of Properties', 'how-to-docs/tutorial02-distinctvaluesquery.md'],
    ],
  },
  queries: {
    title: 'Queries',
    links: [
      ['elementGroupAtTip', 'reference-docs/queries-elementgroupattip.md'],
      ['elementGroupByVersionNumber', 'reference-docs/queries-elementgroupbyversionnumber.md'],
      ['elementGroupExtractionStatus', 'reference-docs/queries-elementgroupextractionstatus.md'],
      ['elementGroupExtractionStatusAtTip', 'reference-docs/queries-elementgroupextractionstatusattip.md'],
      ['elementGroupsByHub', 'reference-docs/queries-elementgroupsbyhub.md'],
      ['elementGroupsByProject', 'reference-docs/queries-elementgroupsbyproject.md'],
      ['elementGroupsByFolder', 'reference-docs/queries-elementgroupsbyfolder.md'],
      ['elementGroupsByFolderAndSubFolders', 'reference-docs/queries-elementgroupsbyfolderandsubfolders.md'],
      ['elementAtTip', 'reference-docs/queries-elementattip.md'],
      ['elementsByHub', 'reference-docs/queries-elementsbyhub.md'],
      ['elementsByProject', 'reference-docs/queries-elementsbyproject.md'],
      ['elementsByFolder', 'reference-docs/queries-elementsbyfolder.md'],
      ['elementsByElementGroup', 'reference-docs/queries-elementsbyelementgroup.md'],
      ['elementsByElementGroupAtVersion', 'reference-docs/queries-elementsbyelementgroupatversion.md'],
      ['hub', 'reference-docs/queries-hub.md'],
      ['hubs', 'reference-docs/queries-hubs.md'],
      ['project', 'reference-docs/queries-project.md'],
      ['projects', 'reference-docs/queries-projects.md'],
      ['folder', 'reference-docs/queries-folder.md'],
      ['foldersByFolder', 'reference-docs/queries-foldersbyfolder.md'],
      ['foldersByProject', 'reference-docs/queries-foldersbyproject.md'],
      ['distinctPropertyValuesInElementGroupById', 'reference-docs/queries-distinctpropertyvaluesinelementgroupbyid.md'],
      ['distinctPropertyValuesInElementGroupByName', 'reference-docs/queries-distinctpropertyvaluesinelementgroupbyname.md'],
      ['propertyDefinitionsByElementGroup', 'reference-docs/queries-propertydefinitionsbyelementgroup.md'],
    ],
  },
  objects: {
    title: 'Objects',
    links: [
      ['ElementGroup', 'reference-docs/objects-elementgroup.md'],
      ['ElementGroupAlternativeIdentifiers', 'reference-docs/objects-elementgroupalternativeidentifiers.md'],
      ['ElementGroupExtractionStatus', 'reference-docs/objects-elementgroupextractionstatus.md'],
      ['Element', 'reference-docs/objects-element.md'],
      ['ElementAlternativeIdentifiers', 'reference-docs/objects-elementalternativeidentifiers.md'],
      ['Elements', 'reference-docs/objects-elements.md'],
      ['ExtractionStatus', 'reference-docs/objects-extractionstatus.md'],
      ['ElementGroups', 'reference-docs/objects-elementgroups.md'],
      ['Comparators', 'reference-docs/objects-comparators.md'],
      ['Folder', 'reference-docs/objects-folder.md'],
      ['Folders', 'reference-docs/objects-folders.md'],
      ['Hub', 'reference-docs/objects-hub.md'],
      ['Hubs', 'reference-docs/objects-hubs.md'],
      ['ElementGroupVersionHistory', 'reference-docs/objects-elementgroupversionhistory.md'],
      ['Pagination', 'reference-docs/objects-pagination.md'],
      ['Project', 'reference-docs/objects-project.md'],
      ['ProjectAlternativeIdentifiers', 'reference-docs/objects-projectalternativeidentifiers.md'],
      ['Projects', 'reference-docs/objects-projects.md'],
      ['Property', 'reference-docs/objects-property.md'],
      ['Properties', 'reference-docs/objects-properties.md'],
      ['PropertyDefinition', 'reference-docs/objects-propertydefinition.md'],
      ['PropertyDefinitionCollection', 'reference-docs/objects-propertydefinitioncollection.md'],
      ['PropertyDefinitions', 'reference-docs/objects-propertydefinitions.md'],
      ['ReferenceProperties', 'reference-docs/objects-referenceproperties.md'],
      ['ReferenceProperty', 'reference-docs/objects-referenceproperty.md'],
      ['User', 'reference-docs/objects-user.md'],
      ['ElementGroupVersion', 'reference-docs/objects-elementgroupversion.md'],
      ['ElementGroupVersions', 'reference-docs/objects-elementgroupversions.md'],
      ['DistinctPropertyValue', 'reference-docs/objects-distinctpropertyvalue.md'],
      ['DistinctPropertyValuesCollection', 'reference-docs/objects-distinctpropertyvaluescollection.md'],
      ['DistinctPropertyValues', 'reference-docs/objects-distinctpropertyvalues.md'],
    ],
  },
  inputs: {
    title: 'Inputs',
    links: [
      ['ElementFilterInput', 'reference-docs/inputs-elementfilterinput.md'],
      ['ElementPropertyFilterInput', 'reference-docs/inputs-elementpropertyfilterinput.md'],
      ['ElementReferenceFilterInput', 'reference-docs/inputs-elementreferencefilterinput.md'],
      ['ReferencePropertyFilterInput', 'reference-docs/inputs-referencepropertyfilterinput.md'],
      ['ElementGroupFilterInput', 'reference-docs/inputs-elementgroupfilterinput.md'],
      ['FolderFilterInput', 'reference-docs/inputs-folderfilterinput.md'],
      ['HubFilterInput', 'reference-docs/inputs-hubfilterinput.md'],
      ['PaginationInput', 'reference-docs/inputs-paginationinput.md'],
      ['ProjectFilterInput', 'reference-docs/inputs-projectfilterinput.md'],
      ['PropertyDefinitionFilterInput', 'reference-docs/inputs-propertydefinitionfilterinput.md'],
      ['PropertyFilterInput', 'reference-docs/inputs-propertyfilterinput.md'],
      ['ElementGroupVersionFilterInput', 'reference-docs/inputs-elementgroupversionfilterinput.md'],
      ['ValueComparatorInput', 'reference-docs/inputs-valuecomparatorinput.md'],
      ['Scalars', 'reference-docs/scalars.md'],
    ],
  },
};

export const categoryNames = Object.keys(categories);

function printCategory(key: string, docsRoot: string): void {
  const cat = categories[key];
  if (!cat) {
    console.error(`Unknown category: ${key}`);
    console.error(`Available categories: ${categoryNames.join(', ')}`);
    process.exit(1);
  }
  console.log(`\n${cat.title}\n${'─'.repeat(cat.title.length)}`);
  for (const [name, rel] of cat.links) {
    console.log(`  ${name}`);
    console.log(`    ${path.join(docsRoot, rel)}`);
  }
  console.log();
}

function printAllCategories(docsRoot: string): void {
  for (const key of categoryNames) {
    printCategory(key, docsRoot);
  }
}

export function queryDocs(category?: string): void {
  const docsRoot = resolveDocsRoot();
  if (!category) {
    printAllCategories(docsRoot);
    return;
  }
  printCategory(category, docsRoot);
}
