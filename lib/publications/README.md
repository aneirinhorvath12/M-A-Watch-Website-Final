# Publication domain prototype

The publication prototype exposes server-friendly, deterministic helpers for
public pages:

- `getPublishedPublications` and `getPublicPublication` enforce public status.
- `searchPublishedPublications` searches approved article text and metadata,
  then applies type, year, attribution and pagination filters.
- `getPublicationFilters`, `getRelatedPublications` and
  `getAdjacentPublications` support collection and report navigation.
- `getFeaturedPublications` provides homepage-ready records.

Routes use native GET forms, so searches and filters have shareable URLs and
continue working without client JavaScript. Seed records include scheduled and
review publications so accidental public leakage can be checked during database
integration.

The records in `data.ts` are representative preview placeholders. Live public
requests use managed D1 content by default and do not substitute these records
when D1 is missing or unavailable. A local or preview environment must set
`PUBLICATION_CONTENT_MODE=demo` explicitly to merge the placeholder catalogue;
missing, blank and unknown values fail closed to managed mode. Markets records
intentionally have no web-article body and therefore cannot pass through the
report renderer or PDF parser.
