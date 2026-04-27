import { UserEntity, PublicUser } from '../../../shared/types';

export interface UpdateUserData {
  name?: string;
  bio?: string;
  location?: string;
  tags?: string[];
  avatarUrl?: string;
  isActive?: boolean;
}

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
  role?: string;
}

/**
 * IUserRepository — all persistence for the User domain.
 * No Mongoose, no ORM — only plain domain types.
 */
export interface IUserRepository {
  /** Find by id — returns null if not found */
  findById(id: string): Promise<UserEntity | null>;

  /** Find by id excluding the password hash */
  findByIdPublic(id: string): Promise<PublicUser | null>;

  /**
   * Find by email.
   * @param includePassword - when true, password hash is included (auth use only)
   */
  findByEmail(email: string, includePassword?: boolean): Promise<UserEntity | null>;

  create(data: CreateUserData): Promise<UserEntity>;

  update(id: string, data: UpdateUserData): Promise<UserEntity | null>;

  deactivate(id: string): Promise<boolean>;
}
