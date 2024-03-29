import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { EventService } from './event.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@Controller('event')
export class EventController {
  constructor(private readonly eventService: EventService) { }

  @Post()
  create(@Body() createEventDto: CreateEventDto) {
    return this.eventService.create(createEventDto);
  }

  @Get()
  findAll() {
    return this.eventService.findAll();
  }

  @Get('/get/browse-event')
  async findBrowseEvent() {
    return this.eventService.findBrowseEvent();

  }

  @Get('/browse-reject-event/:id')
  async BrowseRejectEvent(@Param('id') id: number): Promise<string> {
    return this.eventService.BrowseRejectEvent(id);

  }

  @Get('/browse-acceptance-event/:id')
  async BrowseAcceptanceEvent(@Param('id') id: number): Promise<string> {
    return this.eventService.BrowseAcceptanceEvent(id);

  }


  @Get('/get-one/:id')
  findOne(@Param('id') id: string) {
    return this.eventService.findOne(+id);
  }

  @Patch('/update/:id')
  update(@Param('id') id: string, @Body() updateEventDto: UpdateEventDto) {
    return this.eventService.update(+id, updateEventDto);
  }

  @Delete('/delete/:id')
  remove(@Param('id') id: string) {
    return this.eventService.remove(+id);
  }
}
