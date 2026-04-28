import '../setup';
import { OpportunitySearch } from '../../src/modules/opportunity/opportunity.search';

describe('OpportunitySearch', () => {
  let search: OpportunitySearch;

  beforeEach(() => {
    search = new OpportunitySearch();
  });

  describe('buildQuery', () => {
    const baseDto = {
      page: 1,
      limit: 10,
      status: 'active' as const,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
    };

    it('should build empty filter with defaults', () => {
      const result = search.buildQuery(baseDto);
      expect(result.filter).toEqual({ status: 'active' });
      expect(result.useTextSearch).toBe(false);
      expect(result.sort).toHaveProperty('createdAt', -1);
    });

    it('should add $text search when q is provided', () => {
      const result = search.buildQuery({ ...baseDto, q: 'software engineer' });
      expect(result.filter.$text).toEqual({ $search: 'software engineer' });
      expect(result.useTextSearch).toBe(true);
    });

    it('should filter by type', () => {
      const result = search.buildQuery({ ...baseDto, type: 'internship' });
      expect(result.filter.type).toBe('internship');
    });

    it('should filter by location as regex', () => {
      const result = search.buildQuery({ ...baseDto, location: 'Cairo' });
      expect(result.filter.location).toEqual({ $regex: 'Cairo', $options: 'i' });
    });

    it('should filter by tags using $in', () => {
      const result = search.buildQuery({ ...baseDto, tags: ['typescript', 'nodejs'] });
      expect(result.filter.tags).toEqual({ $in: ['typescript', 'nodejs'] });
    });

    it('should filter by isRemote', () => {
      const result = search.buildQuery({ ...baseDto, isRemote: true });
      expect(result.filter.isRemote).toBe(true);
    });

    it('should add salary.min filter', () => {
      const result = search.buildQuery({ ...baseDto, salaryMin: 3000 });
      expect(result.filter['salary.min']).toEqual({ $gte: 3000 });
    });

    it('should add salary.max filter', () => {
      const result = search.buildQuery({ ...baseDto, salaryMax: 10000 });
      expect(result.filter['salary.max']).toEqual({ $lte: 10000 });
    });

    it('should sort ascending when sortOrder is asc', () => {
      const result = search.buildQuery({ ...baseDto, sortOrder: 'asc' });
      expect(result.sort.createdAt).toBe(1);
    });

    it('should add text score sort when using text search', () => {
      const result = search.buildQuery({ ...baseDto, q: 'developer' });
      expect(result.sort).toHaveProperty('score');
      expect(result.sort).toHaveProperty('createdAt');
    });

    it('should combine multiple filters', () => {
      const result = search.buildQuery({
        ...baseDto,
        type: 'job',
        location: 'Remote',
        tags: ['react'],
        isRemote: true,
      });
      expect(result.filter.type).toBe('job');
      expect(result.filter.isRemote).toBe(true);
      expect(result.filter.tags).toEqual({ $in: ['react'] });
    });
  });
});
