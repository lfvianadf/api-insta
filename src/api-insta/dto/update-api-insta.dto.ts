import { PartialType } from '@nestjs/mapped-types';
import { CreateApiInstaDto } from './create-api-insta.dto';

export class UpdateApiInstaDto extends PartialType(CreateApiInstaDto) {}
