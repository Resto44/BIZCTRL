import React from 'react';
import { Button } from '../../src/components/ui/button';
import { Card, CardContent } from '../../src/components/ui/card';
import { Input } from '../../src/components/ui/input';
import { Textarea } from '../../src/components/ui/textarea';
import { Badge } from '../../src/components/ui/badge';
const inputRef = React.createRef<HTMLInputElement>();
const positive = <Card><CardContent><Button variant="outline" size="sm" disabled onClick={event => event.currentTarget.focus()}>Save</Button><Input ref={inputRef} value="12" type="number" onChange={event => event.currentTarget.value}/><Textarea rows={3}/><Badge variant="secondary">Open</Badge></CardContent></Card>;
// @ts-expect-error unknown variants must remain a type error
const badVariant = <Button variant="imaginary" />;
// @ts-expect-error invalid native property values must remain a type error
const badDisabled = <Button disabled="yes" />;
// @ts-expect-error a textarea ref cannot be attached to an input
const badRef = <Input ref={React.createRef<HTMLTextAreaElement>()} />;
void [positive, badVariant, badDisabled, badRef];
